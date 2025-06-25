// aiService.js

const sanitizeHtml = require('sanitize-html');

// This function communicates with the local Ollama server to generate a summary.
async function generateSummary(articleContent, model = 'phi3:mini') {
    // --- NEW: Sanitize the article content to remove HTML ---
    const cleanContent = sanitizeHtml(articleContent, {
        allowedTags: [],
        allowedAttributes: {},
    });

    // --- NEW: Truncate content to avoid overwhelming the model ---
    const truncatedContent = cleanContent.substring(0, 15000);

    const systemPrompt = `You are a senior editor at a major news publication, an expert in distilling complex topics into clear, concise, and unbiased summaries for a general audience. Your task is to summarize the provided news article. Do not include any information that you would not publish to a large audience.`;

    const userPrompt = `**TASK:** Generate a summary of the article that adheres to the following strict guidelines:

1.  **Headline:** Start with a short, impactful headline that captures the essence of the article. Do not use the original article's title.
2.  **Key Takeaways:** Provide a bulleted list of the 3-4 most important takeaways from the article. Each bullet point should be a complete sentence.
3.  **Broader Context:** In a concluding sentence, briefly explain the broader context or potential implications of the news.

**CONSTRAINTS:**
*   **Tone:** Maintain a strictly neutral, objective, and professional tone.
*   **Length:** The entire summary should be no more than 150 words.
*   **Format:** Use Markdown for formatting. The headline should be bold, followed by the bulleted list, and then the concluding sentence.

**ARTICLE:**
${truncatedContent}`;

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
                prompt: userPrompt, // The user's direct instruction
                system: systemPrompt, // The persona and high-level instructions
                stream: false,
                options: {
                    temperature: 0.2, // Lower temperature for less "creative" and more focused output
                    top_k: 20,        // Further constrains the model's choices
                    top_p: 0.5,       // Further constrains the model's choices
                    seed: 42          // For reproducible results
                }
            }),
        });

        // Check if the request was successful
        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Ollama API request failed with status ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        console.log('Successfully received summary from Ollama.');
        
        const summary = data.response.trim();
        const words = summary.split(/\s+/);

        if (words.length > 200) {
            const truncatedSummary = words.slice(0, 200).join(' ') + '...';
            console.log(`Summary truncated from ${words.length} to 200 words.`);
            return truncatedSummary;
        }

        return summary;

    } catch (error) {
        console.error('Error communicating with Ollama:', error.message);
        // This error is often because the Ollama server isn't running.
        throw new Error('Could not connect to Ollama. Please ensure it is running and the model is available.');
    }
}

// Export the function so it can be used in main.js
module.exports = { generateSummary };