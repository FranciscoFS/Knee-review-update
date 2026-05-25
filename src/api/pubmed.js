const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

// Target journals identified by user
const TARGET_JOURNALS = [
  '"American journal of sports medicine"[Journal]',
  '"Knee surgery, sports traumatology, arthroscopy"[Journal]',
  '"Journal of ISAKOS"[Journal]',
  '"The Knee"[Journal]',
  '"Nature"[Journal]',
  '"Lancet"[Journal]',
  '"The Journal of bone and joint surgery. American volume"[Journal]', // JBJS
  '"Journal of bone and joint infection"[Journal]', // JBJI
  '"Journal of the American Academy of Orthopaedic Surgeons"[Journal]' // JAOOS
];

// Broader query to catch papers that might not explicitly use the word "knee" in the title/abstract
// but mention specific knee structures or procedures.
const KNEE_SURGERY_QUERY = '("knee"[Title/Abstract] OR "anterior cruciate ligament"[Title/Abstract] OR "ACL"[Title/Abstract] OR "meniscus"[Title/Abstract] OR "meniscal"[Title/Abstract] OR "patellofemoral"[Title/Abstract] OR "patella"[Title/Abstract] OR "tibial"[Title/Abstract] OR "femoral"[Title/Abstract])';

export async function fetchRecentPapers(startDate, endDate) {
  // Build the query
  const journalQuery = `(${TARGET_JOURNALS.join(' OR ')})`;
  let fullQuery = `${journalQuery} AND ${KNEE_SURGERY_QUERY}`;
  
  // Format dates for PubMed (YYYY/MM/DD)
  const formattedStart = startDate.toISOString().split('T')[0].replace(/-/g, '/');
  const formattedEnd = endDate.toISOString().split('T')[0].replace(/-/g, '/');
  
  fullQuery += ` AND ("${formattedStart}"[Date - Publication] : "${formattedEnd}"[Date - Publication])`;

  try {
    // 1. eSearch to get IDs
    const searchUrl = `${BASE_URL}/esearch.fcgi?db=pubmed&retmode=json&retmax=50&sort=date&term=${encodeURIComponent(fullQuery)}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();
    
    const ids = searchData.esearchresult?.idlist || [];
    if (ids.length === 0) return [];

    // 2. eSummary to get details
    const summaryUrl = `${BASE_URL}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
    const summaryRes = await fetch(summaryUrl);
    const summaryData = await summaryRes.json();

    const papers = ids.map(id => {
      const details = summaryData.result[id];
      if (!details) return null;
      
      return {
        id,
        title: details.title,
        authors: details.authors ? details.authors.map(a => a.name).join(', ') : 'Unknown Authors',
        journal: details.source,
        date: details.pubdate,
        link: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        abstract: '' // eSummary doesn't return full abstract, but we use title for categorization
      };
    }).filter(Boolean);

    return papers;
  } catch (error) {
    console.error("Error fetching from PubMed:", error);
    return [];
  }
}

export async function fetchAbstract(id) {
  try {
    const fetchUrl = `${BASE_URL}/efetch.fcgi?db=pubmed&id=${id}&retmode=text&rettype=abstract`;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error("Network response was not ok");
    const text = await res.text();
    return text.trim();
  } catch (error) {
    console.error("Error fetching abstract:", error);
    return "Abstract not available.";
  }
}
