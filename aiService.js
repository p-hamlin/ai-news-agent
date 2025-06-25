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
    const prompt = `**SYSTEM:** You are a senior editor at a major news publication, an expert in distilling complex topics into clear, concise, and unbiased summaries for a general audience. Your task is to summarize the provided news article. Do not include any information that you would not publish to a large audience.

**TASK:** Generate a summary of the article that adheres to the following strict guidelines:

1.  **Headline:** Start with a short, impactful headline that captures the essence of the article. Do not use the original article's title.
2.  **Key Takeaways:** Provide a bulleted list of the 3-4 most important takeaways from the article. Each bullet point should be a complete sentence.
3.  **Broader Context:** In a concluding sentence, briefly explain the broader context or potential implications of the news.

**CONSTRAINTS:**
*   **Tone:** Maintain a strictly neutral, objective, and professional tone.
*   **Length:** The entire summary should be no more than 150 words.
*   **Format:** Use Markdown for formatting. The headline should be bold, followed by the bulleted list, and then the concluding sentence.

**ARTICLE:**
${cleanContent}`;

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