import os
import json
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
import time
import re

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "").strip().strip('"').strip("'")
PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils'

TARGET_JOURNALS = [
    '"American journal of sports medicine"[Journal]',
    '"Knee surgery, sports traumatology, arthroscopy"[Journal]',
    '"Journal of ISAKOS"[Journal]',
    '"The Knee"[Journal]',
    '"Nature"[Journal]',
    '"Lancet"[Journal]',
    '"The Journal of bone and joint surgery. American volume"[Journal]',
    '"Journal of bone and joint infection"[Journal]',
    '"Journal of the American Academy of Orthopaedic Surgeons"[Journal]'
]

KNEE_SURGERY_QUERY = '("knee"[Title/Abstract] OR "anterior cruciate ligament"[Title/Abstract] OR "ACL"[Title/Abstract] OR "meniscus"[Title/Abstract] OR "meniscal"[Title/Abstract] OR "patellofemoral"[Title/Abstract] OR "patella"[Title/Abstract] OR "tibial"[Title/Abstract] OR "femoral"[Title/Abstract])'

def categorize_paper_fallback(title):
    lower_title = title.lower()
    if 'acl' in lower_title or 'anterior cruciate' in lower_title: return {'id': 'acl', 'label': 'ACL'}
    if 'meniscus' in lower_title or 'meniscal' in lower_title: return {'id': 'meniscus', 'label': 'Meniscus'}
    if 'arthroplasty' in lower_title or 'replacement' in lower_title or 'tka' in lower_title: return {'id': 'arthroplasty', 'label': 'Arthroplasty / TKA'}
    if 'cartilage' in lower_title or 'chondral' in lower_title: return {'id': 'cartilage', 'label': 'Cartilage'}
    if 'patell' in lower_title or 'pfj' in lower_title: return {'id': 'patellofemoral', 'label': 'Patellofemoral'}
    return {'id': 'other', 'label': 'General Knee'}

def fetch_pubmed_ids(start_date, end_date):
    journal_query = f"({' OR '.join(TARGET_JOURNALS)})"
    full_query = f"{journal_query} AND {KNEE_SURGERY_QUERY}"
    date_filter = f' AND ("{start_date}"[Date - Publication] : "{end_date}"[Date - Publication])'
    full_query += date_filter

    url = f"{PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=50&sort=date&term={urllib.parse.quote(full_query)}"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode())
        return data.get('esearchresult', {}).get('idlist', [])

def fetch_pubmed_details_and_abstracts(ids):
    if not ids: return []
    
    # eSummary for metadata
    summary_url = f"{PUBMED_BASE}/esummary.fcgi?db=pubmed&retmode=json&id={','.join(ids)}"
    req = urllib.request.Request(summary_url)
    papers = []
    with urllib.request.urlopen(req) as response:
        summary_data = json.loads(response.read().decode())
        for pid in ids:
            details = summary_data.get('result', {}).get(pid)
            if not details: continue
            authors = ', '.join([a['name'] for a in details.get('authors', [])]) if details.get('authors') else 'Unknown Authors'
            papers.append({
                'id': pid,
                'title': details.get('title', ''),
                'authors': authors,
                'journal': details.get('source', ''),
                'date': details.get('pubdate', ''),
                'link': f"https://pubmed.ncbi.nlm.nih.gov/{pid}/",
                'abstract': ''
            })

    # eFetch for abstracts (Text format)
    for paper in papers:
        try:
            fetch_url = f"{PUBMED_BASE}/efetch.fcgi?db=pubmed&id={paper['id']}&retmode=text&rettype=abstract"
            req = urllib.request.Request(fetch_url)
            with urllib.request.urlopen(req) as response:
                text = response.read().decode().strip()
                # Remove author affiliations if they exist to clean it up, but keep the abstract!
                if "Author information:" in text:
                    parts = text.split("Author information:")
                    head = parts[0]
                    # The rest contains affiliations, then a double newline, then the abstract
                    tail = parts[1]
                    if "\n\n" in tail:
                        abstract_body = tail.split("\n\n", 1)[1]
                        text = head + "\n\n" + abstract_body
                paper['abstract'] = text
        except Exception as e:
            print(f"Failed to fetch abstract for {paper['id']}: {e}")
        # Add a tiny delay to avoid PubMed 429 Too Many Requests
        time.sleep(0.35)
            
    return papers

def analyze_with_gemini(papers):
    if not GEMINI_API_KEY:
        print("No GEMINI_API_KEY found, using fallback categorization without AI summaries.")
        for p in papers:
            p['ai_summary'] = "AI summary not available."
            p['ai_relevance'] = 5
            p['ai_study_type'] = "Unknown Study Type"
            p['category'] = categorize_paper_fallback(p['title'])
        return papers

    print(f"Analyzing {len(papers)} papers with AI...")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key={GEMINI_API_KEY}"
    
    # Batch processing to stay well under rate limits
    batch_size = 5
    for i in range(0, len(papers), batch_size):
        batch = papers[i:i+batch_size]
        
        prompt = """
        You are a highly skilled Orthopaedic Surgeon and Researcher. 
        Analyze the following scientific paper abstracts and return a JSON array containing objects with the exact following keys for each paper:
        - "id": the paper id
        - "study_type": A short phrase describing the study type (e.g. "Randomized Controlled Trial", "Retrospective Cohort", "Systematic Review", "Case Report", "In-Vitro Study").
        - "relevance_score": An integer from 1 to 10 rating the clinical relevance and impact of the paper.
        - "abstract_summary": A concise, 1 or 2 sentence layman's clinical takeaway from the abstract.
        - "category_id": One of the following exact strings based on the topic: "acl", "meniscus", "arthroplasty", "cartilage", "patellofemoral", or "other".
        - "category_label": The human readable label for the category: "ACL", "Meniscus", "Arthroplasty / TKA", "Cartilage", "Patellofemoral", or "General Knee".
        
        ONLY output valid JSON. No markdown formatting blocks.
        Papers:
        """
        for p in batch:
            prompt += f"\n\nID: {p['id']}\nTitle: {p['title']}\nAbstract: {p['abstract']}"

        data = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        
        req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers={'Content-Type': 'application/json'})
        
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode())
                text_response = res_data['candidates'][0]['content']['parts'][0]['text']
                # Clean markdown JSON blocks if Gemini added them
                text_response = text_response.replace('```json', '').replace('```', '').strip()
                
                ai_results = json.loads(text_response)
                
                # Merge back into papers
                for p in batch:
                    matched = False
                    for result in ai_results:
                        if str(p['id']) == str(result.get('id', '')):
                            p['ai_study_type'] = result.get('study_type', 'Unknown')
                            p['ai_relevance'] = result.get('relevance_score', 5)
                            p['ai_summary'] = result.get('abstract_summary', '')
                            p['category'] = {
                                'id': result.get('category_id', 'other'),
                                'label': result.get('category_label', 'General Knee')
                            }
                            matched = True
                            break
                    if not matched:
                        p['ai_summary'] = "AI summary generated but ID mismatched."
                        p['ai_relevance'] = 5
                        p['ai_study_type'] = "Unknown"
                        p['category'] = categorize_paper_fallback(p['title'])
                            
        except Exception as e:
            err_msg = str(e)
            if hasattr(e, 'read'):
                try:
                    err_msg += " - " + e.read().decode()
                except:
                    pass
            print(f"Error calling Gemini for batch starting at index {i}: {err_msg}")
            for p in batch:
                if 'ai_summary' not in p:
                    p['ai_summary'] = "AI summary failed."
                    p['ai_relevance'] = 5
                    p['ai_study_type'] = "Unknown"
                    p['category'] = categorize_paper_fallback(p['title'])
                    
        # Sleep to respect 15 RPM free tier limit
        time.sleep(4)

    return papers


def main():
    end_date_env = os.environ.get("END_DATE", "").strip()
    start_date_env = os.environ.get("START_DATE", "").strip()

    if start_date_env and end_date_env:
        start_str = start_date_env
        end_str = end_date_env
        print(f"Using custom date range from environment: {start_str} to {end_str}")
    else:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=7)
        start_str = start_date.strftime("%Y/%m/%d")
        end_str = end_date.strftime("%Y/%m/%d")
        print(f"Using default 7-day date range: {start_str} to {end_str}")
        
    print(f"Fetching IDs from {start_str} to {end_str}...")
    ids = fetch_pubmed_ids(start_str, end_str)
    print(f"Found {len(ids)} papers.")
    
    papers = fetch_pubmed_details_and_abstracts(ids)
    papers = analyze_with_gemini(papers)
    
    # Sort by relevance score descending
    papers.sort(key=lambda x: x.get('ai_relevance', 0), reverse=True)
    
    # Save to public/data/weekly_feed.json and feed_YYYY-MM-DD.json
    output_dir = os.path.join(os.path.dirname(__file__), '..', 'public', 'data')
    os.makedirs(output_dir, exist_ok=True)
    
    # Generate historical filename
    date_formatted = end_str.replace('/', '-')
    history_filename = f"feed_{date_formatted}.json"
    history_path = os.path.join(output_dir, history_filename)
    
    with open(history_path, 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2)
        
    # Also overwrite the default one for backward compatibility
    default_path = os.path.join(output_dir, 'weekly_feed.json')
    with open(default_path, 'w', encoding='utf-8') as f:
        json.dump(papers, f, indent=2)
        
    # Update feed_history.json
    history_index_path = os.path.join(output_dir, 'feed_history.json')
    feed_history = []
    if os.path.exists(history_index_path):
        try:
            with open(history_index_path, 'r', encoding='utf-8') as f:
                feed_history = json.load(f)
        except Exception:
            pass
            
    # Check if this date already exists to update it, or prepend it
    date_obj = datetime.strptime(end_str, "%Y/%m/%d")
    label = f"Week of {date_obj.strftime('%b %d, %Y')}"
    
    new_entry = {
        "date": date_formatted,
        "file": history_filename,
        "label": label
    }
    
    # Remove existing entry for the same date if it exists
    feed_history = [entry for entry in feed_history if entry.get("date") != date_formatted]
    # Add new entry at the top
    feed_history.insert(0, new_entry)
    
    # Sort history descending by date just to be safe
    feed_history.sort(key=lambda x: x.get("date", ""), reverse=True)
    
    with open(history_index_path, 'w', encoding='utf-8') as f:
        json.dump(feed_history, f, indent=2)
        
    print(f"Successfully saved {len(papers)} papers to {history_filename} and updated history.")

if __name__ == "__main__":
    main()
