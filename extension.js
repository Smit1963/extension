const vscode = require('vscode');
const axios = require('axios');

async function callLLMAssistant(prompt) {
    try {
        // Replace with your LLM API endpoint (DeepSeek, OpenAI, etc.)
        const response = await axios.post('https://api.deepseek.com/v1/chat/completions', {
            prompt: prompt,
            max_tokens: 150
        }, {
            headers: {
                'Authorization': `Bearer YOUR_API_KEY`,
                'Content-Type': 'application/json'
            }
        });
        return response.data.choices[0].text.trim();
    } catch (error) {
        console.error('Error calling LLM API:', error);
        return "Sorry, I couldn't process your request.";
    }
}

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
