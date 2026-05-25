// Rule-based categorization for static sites
export function categorizePaper(title) {
  const lowerTitle = title.toLowerCase();
  
  if (lowerTitle.includes('acl') || lowerTitle.includes('anterior cruciate ligament')) {
    return { id: 'acl', label: 'ACL' };
  }
  if (lowerTitle.includes('meniscus') || lowerTitle.includes('meniscal')) {
    return { id: 'meniscus', label: 'Meniscus' };
  }
  if (lowerTitle.includes('arthroplasty') || lowerTitle.includes('replacement') || lowerTitle.includes('tka') || lowerTitle.includes('uka')) {
    return { id: 'arthroplasty', label: 'Arthroplasty' };
  }
  if (lowerTitle.includes('cartilage') || lowerTitle.includes('chondral') || lowerTitle.includes('osteochondral')) {
    return { id: 'cartilage', label: 'Cartilage' };
  }
  if (lowerTitle.includes('patell') || lowerTitle.includes('pfj') || lowerTitle.includes('mpfl')) {
    return { id: 'patellofemoral', label: 'Patellofemoral' };
  }
  
  return { id: 'other', label: 'General Knee' };
}
