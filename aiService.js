// aiService.js

const sanitizeHtml = require('sanitize-html');

// This function communicates with the local Ollama server to generate a summary.
async function generateSummary(articleContent, model = 'phi3:mini') {
    // --- NEW: Sanitize the article content to remove HTML ---
    const cleanContent = sanitizeHtml(articleContent, {
        allowedTags: [],
        allowedAttributes: {},
    });

    // A clear, concise prompt for the LLM.
    const prompt = `SYSTEM: You are an expert news summarizer. Provide a concise, neutral summary of the following article in 3 bullet points. ARTICLE: ${cleanContent}`;

    console.log(`Sending request to Ollama with model: ${model}`);

    try {
        // Use the native fetch API to make a POST request to the Ollama API.
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                prompt: prompt,
                stream: false, // We want the full response at once.
            }),
        });

        // Check if the request was successful
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Successfully received summary from Ollama.');
        return data.response.trim(); // Return the summary text.

    } catch (error) {
        console.error('Error communicating with Ollama:', error.message);
        // This error is often because the Ollama server isn't running.
        throw new Error('Could not connect to Ollama. Please ensure it is running and the model is available.');
    }
}

// Export the function so it can be used in main.js
module.exports = { generateSummary };