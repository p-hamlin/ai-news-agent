# AI News Aggregator Project Analysis

This document provides a detailed analysis of the AI News Aggregator project, intended for reference in future development sessions.

## Project Overview

The AI News Aggregator is a desktop application built with Electron. It allows users to subscribe to RSS feeds, fetches articles from those feeds, and uses a local AI model (via Ollama) to generate summaries of the articles. The application is designed to be private and offline-first, with all data stored in a local SQLite database.

## Core Technologies

*   **Electron**: The application is built as a desktop application using the Electron framework.
*   **Node.js**: The backend logic is written in Node.js.
*   **React**: The frontend is built with React, using JSX transpiled in the browser by Babel.
*   **Tailwind CSS**: The UI is styled with Tailwind CSS.
*   **SQLite**: The application uses a local SQLite database to store all data.
*   **Ollama**: The application communicates with a local Ollama server to generate AI summaries.

## File-by-File Breakdown

### `main.js`

*   **Purpose**: This is the main entry point for the Electron application.
*   **Key Responsibilities**:
    *   Manages the application's lifecycle (creating the main window, handling window-all-closed events, etc.).
    *   Runs the agentic workflow for fetching and summarizing articles.
    *   Handles all backend logic for interacting with the database and the AI service.
    *   Exposes backend functionality to the frontend via IPC handlers.

### `aiService.js`

*   **Purpose**: This module is responsible for communicating with the Ollama AI server.
*   **Key Responsibilities**:
    *   Takes article content as input.
    *   Sanitizes the HTML from the article content.
    *   Sends the cleaned content to the Ollama API with a specific prompt.
    *   Returns the generated summary.

### `database.js`

*   **Purpose**: This file sets up and manages the SQLite database.
*   **Key Responsibilities**:
    *   Defines the schema for the `feeds` and `articles` tables.
    *   Provides a connection object that's used throughout the application.
    *   Includes logic to gracefully add new columns to the tables if they don't exist.

### `preload.js`

*   **Purpose**: This script acts as a secure bridge between the Electron main process and the renderer process.
*   **Key Responsibilities**:
    *   Exposes a controlled set of APIs to the frontend.
    *   Ensures that the frontend doesn't have direct access to Node.js APIs.

### `public/index.html`

*   **Purpose**: This is the main UI file for the application.
*   **Key Responsibilities**:
    *   Defines the structure of the user interface.
    *   Uses React and Tailwind CSS to create a dynamic and responsive experience.
    *   Communicates with the backend through the `window.api` object exposed by the `preload.js` script.

## Agentic Workflow

The application uses a simple but effective agentic workflow to manage background tasks:

1.  **Agent Cycle**: A main controller runs on a timer (every 5 minutes).
2.  **Fetcher Agent**: This agent fetches the latest articles from all RSS feeds and saves any new ones to the database with the status `new`.
3.  **Summarizer Agent**: This agent looks for articles with the status `new`, processes them in small batches, and updates their status to `summarizing`, `summarized`, or `failed`.

This workflow ensures that the application remains responsive while it fetches and summarizes articles in the background.
