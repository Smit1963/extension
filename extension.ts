import * as dotenv from 'dotenv';
const fetch = (...args: Parameters<typeof import('node-fetch')['default']>) =>
  import('node-fetch').then(mod => mod.default(...args));
import * as vscode from 'vscode';

dotenv.config();  // ✅ Load .env file

const apiKey = process.env.API_KEY;  // ✅ Read API key

if (!apiKey) {
  console.error('❌ API key not found! Make sure your .env file has API_KEY=your_key_here');
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('✅ Error Explainer Extension is now active!');

  let disposable = vscode.commands.registerCommand('extension.explainError', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('No active editor detected.');
      return;
    }

    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);

    if (!selectedText.trim()) {
      vscode.window.showInformationMessage('Please select an error message to explain.');
      return;
    }

    try {
      const explanation = await fetchExplanation(selectedText);
      
      if (explanation) {
        vscode.window.showInformationMessage(explanation);
      } else {
        vscode.window.showErrorMessage('No explanation received from Groq API.');
      }

    } catch (error) {
      console.error('Error fetching explanation:', error);
      vscode.window.showErrorMessage('Failed to fetch explanation.');
    }
  });

  context.subscriptions.push(disposable);
}

export async function deactivate() {}

interface GroqAPIResponse {
  choices?: Array<{ delta: { content: string } }>;
}

async function fetchExplanation(errorMessage: string): Promise<string | undefined> {
  const url = 'https://api.groq.com/openai/v1/chat/completions';  // Replace with the correct endpoint if needed

  const body = JSON.stringify({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",  // Replace with the correct Groq model name
    messages: [
      { role: "user", content: `Explain this error: ${errorMessage}` }
    ],
    temperature: 0.2,
    stream: true  // Enable streaming
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: body
  });

  const rawText = await response.text();
  console.log('🌐 Raw response from Groq:', rawText);

  let data: GroqAPIResponse;
  try {
    data = JSON.parse(rawText);
  } catch (error) {
    console.error('❌ Failed to parse JSON from Groq:', error);
    return undefined;
  }

  // Collecting streamed data and returning the explanation
  let explanation = '';
  for (const chunk of data.choices || []) {
    explanation += chunk.delta?.content || '';
  }

  return explanation;
}
