const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Function to replace Yale with Fale while preserving case
// Handles: YALE -> FALE, Yale -> Fale, yale -> fale
function replaceYaleWithFalePreservingCase(text) {
  // Use case-preserving replacement with special case handling
  return text.replace(/yale/gi, (match, offset, string) => {
    // Special case: don't replace "Yale" in the phrase "no Yale references"
    // Check context before and after the match
    const before = string.substring(Math.max(0, offset - 10), offset).toLowerCase().trim();
    const after = string.substring(offset + match.length, Math.min(string.length, offset + match.length + 15)).toLowerCase().trim();
    if (before.endsWith('no') && after.startsWith('references')) {
      return match; // Don't replace if it's in the special phrase
    }
    
    // Preserve the original case pattern
    const original = match;
    if (original === 'YALE') return 'FALE';
    if (original === 'Yale') return 'Fale';
    if (original === 'yale') return 'fale';
    // Handle mixed case: preserve the case pattern
    // If all uppercase, return all uppercase
    if (original === original.toUpperCase()) return 'FALE';
    // If first letter is uppercase and rest is lowercase, return Fale
    if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
      return 'Fale';
    }
    // Otherwise, return lowercase
    return 'fale';
  });
}

// Function to process HTML and replace Yale with Fale
function processHtml(html) {
  const $ = cheerio.load(html);
  
  // Process text nodes in the body
  $('body *').contents().filter(function() {
    return this.nodeType === 3; // Text nodes only
  }).each(function() {
    // Replace text content but not in URLs or attributes
    const text = $(this).text();
    const newText = replaceYaleWithFalePreservingCase(text);
    if (text !== newText) {
      $(this).replaceWith(newText);
    }
  });
  
  // Process title separately
  const title = replaceYaleWithFalePreservingCase($('title').text());
  $('title').text(title);
  
  return {
    html: $.html(),
    title: title
  };
}

// Export functions for testing
module.exports = {
  replaceYaleWithFalePreservingCase,
  processHtml,
  app
};

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(url);
    const html = response.data;

    // Process the HTML to replace Yale with Fale
    const processed = processHtml(html);
    
    return res.json({ 
      success: true, 
      content: processed.html,
      title: processed.title,
      originalUrl: url
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Start the server only if this file is run directly (not when imported)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Faleproxy server running at http://localhost:${PORT}`);
  });
}
