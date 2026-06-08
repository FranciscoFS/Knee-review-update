import { useState, useEffect } from 'react';
import { fetchRecentPapers, fetchAbstract } from './api/pubmed';
import { categorizePaper } from './utils/categorize';
import { subDays, format } from 'date-fns';
import { Search, ExternalLink, Calendar as CalendarIcon, RefreshCw, X, Sparkles, BookOpen, Activity } from 'lucide-react';

function App() {
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAiFeed, setIsAiFeed] = useState(true);
  
  // History state
  const [feedHistory, setFeedHistory] = useState([]);
  const [selectedFeedFile, setSelectedFeedFile] = useState('weekly_feed.json');
  
  // Modal states
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [abstractText, setAbstractText] = useState('');
  const [loadingAbstract, setLoadingAbstract] = useState(false);

  // Date states
  const [startDate, setStartDate] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  // Category filter
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('relevance');

  // Local AI execution state
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [runningLocalScript, setRunningLocalScript] = useState(false);

  useEffect(() => {
    // Check if running on localhost to show the dev button
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      setIsLocalhost(true);
    }
  }, []);

  const loadAiFeed = async (filename = 'weekly_feed.json') => {
    setLoading(true);
    setError(null);
    setIsAiFeed(true);
    try {
      const feedPath = `${import.meta.env.BASE_URL}data/${filename}?t=${new Date().getTime()}`;
      const res = await fetch(feedPath);
      if (!res.ok) throw new Error("Feed not generated yet");
      const data = await res.json();
      setPapers(data);
    } catch (err) {
      console.log("No AI feed found, falling back to live fetch", err);
      // Fallback if the json doesn't exist yet (e.g. before first GitHub action run)
      loadLivePapers();
    } finally {
      setLoading(false);
    }
  };

  const loadLivePapers = async () => {
    setLoading(true);
    setError(null);
    setIsAiFeed(false);
    try {
      const results = await fetchRecentPapers(new Date(startDate), new Date(endDate));
      
      const categorized = results.map(p => ({
        ...p,
        category: categorizePaper(p.title)
      }));
      
      setPapers(categorized);
    } catch (err) {
      setError("Failed to fetch papers. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadHistoryIndex = async () => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}data/feed_history.json?t=${new Date().getTime()}`);
      if (res.ok) {
        const historyData = await res.json();
        setFeedHistory(historyData);
        if (historyData.length > 0) {
          // Set the most recent as selected
          setSelectedFeedFile(historyData[0].file);
        }
      }
    } catch (err) {
      console.log("No feed history found yet.");
    }
  };

  useEffect(() => {
    // On first load, load the static AI feed and history index
    loadHistoryIndex().then(() => loadAiFeed());
  }, []);

  const handleFeedChange = (e) => {
    const file = e.target.value;
    setSelectedFeedFile(file);
    loadAiFeed(file);
  };

  const handleRunLocalScript = async () => {
    setRunningLocalScript(true);
    try {
      // Add a cache buster query parameter to avoid caching when we reload
      const res = await fetch('/api/run-script', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        alert("Script executed successfully! Reloading feed...");
        await loadAiFeed(); // Reload the feed to show new data
      } else {
        alert(`Failed to run script: ${data.error}`);
      }
    } catch (err) {
      alert("Error contacting local server. Make sure you are running 'npm run dev'.");
    } finally {
      setRunningLocalScript(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadLivePapers();
  };

  const openModal = async (paper) => {
    setSelectedPaper(paper);
    setAbstractText(paper.abstract || ''); 
    
    // If abstract is missing (e.g. from live fetch), fetch it
    if (!paper.abstract) {
      setLoadingAbstract(true);
      const text = await fetchAbstract(paper.id);
      setAbstractText(text);
      setLoadingAbstract(false);
    }
  };

  const closeModal = () => {
    setSelectedPaper(null);
    setAbstractText('');
  };

  const filteredPapers = selectedCategory === 'all' 
    ? papers 
    : papers.filter(p => p.category.id === selectedCategory);

  const sortedPapers = [...filteredPapers].sort((a, b) => {
    if (sortBy === 'relevance') {
      const relA = a.ai_relevance || 0;
      const relB = b.ai_relevance || 0;
      return relB - relA;
    } else {
      return new Date(b.date) - new Date(a.date);
    }
  });

  return (
    <div className="app-container">
      <header className="header">
        <h1>Knee Surgery Literature</h1>
        <p>Your weekly updated feed of top orthopaedic journals.</p>
        {isAiFeed && (
          <div className="ai-badge-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <div className="ai-badge">
              <Sparkles size={16} /> AI-Powered Feed
            </div>
            {feedHistory.length > 0 && (
              <select 
                value={selectedFeedFile}
                onChange={handleFeedChange}
                className="feed-history-select"
                style={{ padding: '0.4rem 0.8rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0', background: '#fff', fontSize: '0.9rem', cursor: 'pointer', outline: 'none' }}
              >
                {feedHistory.map(entry => (
                  <option key={entry.file} value={entry.file}>{entry.label}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {isLocalhost && isAiFeed && (
          <div style={{ marginTop: '1rem' }}>
            <button 
              className="btn" 
              style={{ background: '#8b5cf6', margin: '0 auto' }} 
              onClick={handleRunLocalScript} 
              disabled={runningLocalScript}
            >
              {runningLocalScript ? <RefreshCw className="spinner" size={18} /> : <Activity size={18} />}
              {runningLocalScript ? 'Running Python Script...' : 'Force Local AI Update'}
            </button>
          </div>
        )}
      </header>

      <form className="filters-card" onSubmit={handleSearch}>
        <div className="filter-group">
          <label htmlFor="startDate">Start Date</label>
          <input 
            type="date" 
            id="startDate" 
            value={startDate} 
            onChange={e => setStartDate(e.target.value)} 
            required 
          />
        </div>
        <div className="filter-group">
          <label htmlFor="endDate">End Date</label>
          <input 
            type="date" 
            id="endDate" 
            value={endDate} 
            onChange={e => setEndDate(e.target.value)} 
            required 
          />
        </div>
        <div className="filter-group">
          <label htmlFor="category">Category</label>
          <select 
            id="category" 
            value={selectedCategory} 
            onChange={e => setSelectedCategory(e.target.value)}
          >
            <option value="all">All Topics</option>
            <option value="acl">ACL</option>
            <option value="meniscus">Meniscus</option>
            <option value="arthroplasty">Arthroplasty / TKA</option>
            <option value="cartilage">Cartilage</option>
            <option value="patellofemoral">Patellofemoral</option>
            <option value="other">General Knee</option>
          </select>
        </div>
        <div className="filter-group">
          <label htmlFor="sortBy">Sort By</label>
          <select 
            id="sortBy" 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value)}
          >
            <option value="relevance">Relevance (AI)</option>
            <option value="date">Date (Newest)</option>
          </select>
        </div>
        <button type="submit" className="btn" disabled={loading}>
          {loading ? <RefreshCw className="spinner" size={20} /> : <Search size={20} />}
          {loading ? 'Searching...' : 'Search'}
        </button>
        {!isAiFeed && (
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={() => {
              const defaultFile = feedHistory.length > 0 ? feedHistory[0].file : 'weekly_feed.json';
              setSelectedFeedFile(defaultFile);
              loadAiFeed(defaultFile);
            }} 
            disabled={loading}
          >
            <Sparkles size={20} /> Return to AI Feed
          </button>
        )}
      </form>

      {loading && (
        <div className="loading-state">
          <RefreshCw className="spinner" size={40} />
          <h2>Fetching research...</h2>
        </div>
      )}

      {error && (
        <div className="empty-state">
          <h2>Oops!</h2>
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && sortedPapers.length === 0 && (
        <div className="empty-state">
          <CalendarIcon size={48} opacity={0.3} />
          <h2>No papers found</h2>
          <p>Try adjusting your date range or category filter.</p>
        </div>
      )}

      {!loading && !error && sortedPapers.length > 0 && (
        <div className="papers-grid">
          {sortedPapers.map(paper => (
            <div 
              className="paper-card clickable" 
              key={paper.id} 
              onClick={() => openModal(paper)}
            >
              <div className="paper-journal">{paper.journal}</div>
              <h3 className="paper-title">{paper.title}</h3>
              <div className="paper-authors">{paper.authors}</div>
              
              {paper.ai_summary && (
                <div className="paper-ai-preview">
                  <strong>Takeaway:</strong> {paper.ai_summary}
                </div>
              )}
              
              <div className="paper-footer">
                <div className="paper-date">
                  <CalendarIcon size={14} />
                  {paper.date}
                </div>
                <span className={`paper-category ${paper.category.id}`}>
                  {paper.category.label}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Overlay */}
      {selectedPaper && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={closeModal}>
              <X size={24} />
            </button>
            <div className="paper-journal">{selectedPaper.journal}</div>
            <h2 className="modal-title">{selectedPaper.title}</h2>
            <div className="paper-authors mb-4">{selectedPaper.authors}</div>
            
            <div className="modal-body">
              {selectedPaper.ai_summary && (
                <div className="modal-ai-box">
                  <div className="ai-box-header">
                    <Sparkles size={18} />
                    AI Analysis
                  </div>
                  <div className="ai-box-grid">
                    <div className="ai-stat">
                      <BookOpen size={16} />
                      <span><strong>Study Type:</strong> {selectedPaper.ai_study_type}</span>
                    </div>
                    <div className="ai-stat">
                      <Activity size={16} />
                      <span><strong>Relevance Score:</strong> {selectedPaper.ai_relevance}/10</span>
                    </div>
                  </div>
                  <p className="ai-summary"><strong>Clinical Takeaway:</strong> {selectedPaper.ai_summary}</p>
                </div>
              )}
              
              <h3>Abstract</h3>
              {loadingAbstract ? (
                <div className="loading-state" style={{ padding: '2rem 0' }}>
                  <RefreshCw className="spinner" size={24} />
                  <p>Loading abstract...</p>
                </div>
              ) : (
                <p className="abstract-text">{abstractText || "Abstract not available."}</p>
              )}
            </div>

            <div className="modal-footer">
              <a 
                href={selectedPaper.link} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn"
              >
                <ExternalLink size={18} />
                View on PubMed
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
