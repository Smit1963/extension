const vscode = require('vscode');
const axios = require('axios');

const vscode = require('vscode');
const axios = require('axios');

// Configuration for the LLM API
const LLM_CONFIG = {
    API_ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
    API_KEY: 'DEEPSEEK_API', 
    DEFAULT_MAX_TOKENS: 150, 
    DEFAULT_TEMPERATURE: 0.7 
};

async function callLLMAssistant(prompt) {
    try {
        const response = await axios.post(
            LLM_CONFIG.API_ENDPOINT,
            {
                model: "deepseek-chat", // Specify the model you're using
                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ],
                max_tokens: LLM_CONFIG.DEFAULT_MAX_TOKENS,
                temperature: LLM_CONFIG.DEFAULT_TEMPERATURE
            },
            {
                headers: {
                    'Authorization': `Bearer ${LLM_CONFIG.API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Extract the response content (adjust based on your API's response structure)
        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error calling LLM API:', error);
        return "Sorry, I couldn't process your request. Error: " + error.message;
    }
}

// Rest of the extension code remains the same...
function activate(context) {
    let disposable = vscode.commands.registerCommand('llm-assistant.ask', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found!');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        
        const userQuery = await vscode.window.showInputBox({
            prompt: 'Ask your coding question or provide context',
            value: selectedText || ''
        });

        if (userQuery) {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Consulting LLM Assistant...",
                cancellable: false
            }, async (progress) => {
                const response = await callLLMAssistant(userQuery);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `Question: ${userQuery}\n\nAnswer: ${response}`,
                    language: 'markdown'
                });
                
                vscode.window.showTextDocument(doc);
                return;
            });
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
