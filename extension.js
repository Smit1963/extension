const vscode = require('vscode');
const axios = require('axios');

// Get configuration from VS Code settings
function getConfig() {
    const config = vscode.workspace.getConfiguration('vspilot');
    return {
        API_ENDPOINT: 'https://api.deepseek.com/v1/chat/completions',
        API_KEY: config.get('vspilot.apiKey') || '',
        MAX_TOKENS: config.get('vspilot.maxTokens') || 150,
        TEMPERATURE: config.get('vspilot.temperature') || 0.7
    };
}

async function callLLMAssistant(prompt) {
    const { API_ENDPOINT, API_KEY, MAX_TOKENS, TEMPERATURE } = getConfig();
    
    if (!API_KEY) {
        vscode.window.showErrorMessage('API key is not configured. Please set it in settings.');
        return "Error: API key not configured";
    }

    try {
        const response = await axios.post(
            API_ENDPOINT,
            {
                model: "deepseek-chat",
                messages: [{
                    role: "user",
                    content: prompt
                }],
                max_tokens: MAX_TOKENS,
                temperature: TEMPERATURE
            },
            {
                headers: {
                    'Authorization': `Bearer ${API_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }
        );
        
        return response.data.choices[0]?.message?.content?.trim() || "No response from the assistant.";
    } catch (error) {
        console.error('Error calling LLM API:', error);
        const errorMessage = error.response?.data?.error?.message || error.message;
        return `Sorry, I couldn't process your request. ${errorMessage}`;
    }
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('vspilot.ask', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found!');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        
        const userQuery = await vscode.window.showInputBox({
            prompt: 'Ask your coding question or provide context',
            value: selectedText || '',
            placeHolder: 'Type your question here...',
            validateInput: text => {
                if (!text || text.trim().length === 0) {
                    return 'Please enter a question or select some code first';
                }
                return null;
            }
        });

        if (!userQuery) return;

        try {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Consulting LLM Assistant...",
                cancellable: true
            }, async (progress, token) => {
                token.onCancellationRequested(() => {
                    vscode.window.showInformationMessage("LLM request cancelled.");
                });

                progress.report({ message: "Processing your request..." });
                const response = await callLLMAssistant(userQuery);
                
                const doc = await vscode.workspace.openTextDocument({
                    content: `## Question\n${userQuery}\n\n## Assistant Response\n${response}`,
                    language: 'markdown'
                });
                
                await vscode.window.showTextDocument(doc);
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get assistant response: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};
