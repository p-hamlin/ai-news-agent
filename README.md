# AI News Aggregator User Guide

## Introduction

Welcome to the AI News Aggregator! This is a desktop application that allows you to create a personalized news feed from your favorite RSS sources. It then uses a local AI model to automatically generate concise summaries of the articles, helping you stay informed more efficiently. All your data is stored locally, ensuring your privacy.

## Running the Application

To run the application, you will need to have [Node.js](https://nodejs.org/) and [Ollama](https://ollama.ai/) installed on your system.

1.  **Install Dependencies**: Open a terminal in the project directory and run the following command:

    ```bash
    npm install
    ```

2.  **Start the Application**: Once the dependencies are installed, run the following command:

    ```bash
    npm start
    ```

## How to Use

### Adding, Editing, & Removing RSS Feeds

1.  Click the **Settings** icon (the cog) in the top-right corner of the Feeds panel.
2.  To **add a feed**, paste the RSS feed URL into the input box and click "Add".
3.  To **edit a feed's display name**, click the pencil icon, enter the new name, and click the checkmark to save.
4.  To **remove a feed**, click the trash can icon next to the feed you want to remove.

### Using Different AI Models

By default, the application uses the `phi3:mini` model for summarization. You can change this by modifying the `aiService.js` file.

1.  Open the `aiService.js` file in a text editor.
2.  Find the following line:

    ```javascript
    async function generateSummary(articleContent, model = 'phi3:mini') {
    ```

3.  Change `'phi3:mini'` to the name of the Ollama model you want to use (e.g., `'llama3:8b'`).
4.  Save the file and restart the application.

### Accessing the Database

All application data is stored in a local SQLite database file named `news-aggregator.db`. You can access this file using any standard SQLite database browser, such as [DB Browser for SQLite](https://sqlitebrowser.org/).

This allows you to manually inspect the data, run queries, and perform backups.

## File Descriptions

*   `aiService.js`: This file is responsible for communicating with the local Ollama AI server. It takes the content of an article, sends it to the Ollama API, and returns the generated summary.
*   `database.js`: This file sets up the SQLite database. It defines the structure of the `feeds` and `articles` tables and handles the initial connection.
*   `main.js`: This is the main entry point for the Electron application. It manages the application's lifecycle, creates the browser window, and runs the background agent system.
*   `news-aggregator.db`: This is the local SQLite database file where all application data (your feeds and articles) is stored.
*   `package.json`: This file contains the project's metadata, including its name, version, and dependencies.
*   `preload.js`: This script acts as a secure bridge between the Electron main process (the backend) and the renderer process (the UI). It exposes a controlled set of APIs to the frontend.
*   `public/index.html`: This is the main HTML file that defines the structure of the user interface. It uses React and Tailwind CSS to create a dynamic and responsive experience.

## The Agentic Workflow

The application uses a simple but powerful multi-agent system to manage background tasks. This ensures that the application remains responsive while it fetches and summarizes articles.

1.  **The Agent Cycle**: A main controller runs on a timer (every 5 minutes). It executes the following agents in a sequence.
2.  **The Fetcher Agent**: This agent runs first. It iterates through all your saved RSS feeds, fetches the latest articles, and saves any new ones to the database with the status `new`.
3.  **The Summarizer Agent**: This agent runs second. It looks for articles in the database with the status `new`. It then processes them in small batches:
    *   It updates the article's status to `summarizing`.
    *   It sends the article's content to the AI model to generate a summary.
    *   If successful, it updates the status to `summarized` and saves the summary.
    *   If it fails, it updates the status to `failed`.

This cycle ensures that fetching and summarizing happen in a coordinated and robust way, providing a seamless experience.
