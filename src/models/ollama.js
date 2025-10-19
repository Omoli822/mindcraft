iimport { strictFormat } from '../utils/text.js';
import { getKey, hasKey } from '../utils/keys.js';

export class Ollama {
    static prefix = 'ollama';

    constructor(model_name, url, params) {
        this.model_name = model_name;
        this.params = params;
        this.url = url || 'http://127.0.0.1:11434';
        this.chat_endpoint = '/api/chat';
        this.embedding_endpoint = '/api/embeddings';
    }

    async sendRequest(turns, systemMessage, stop_seq = '***') {
        let messages = strictFormat(turns);
        messages = messages.map(message => {
            message.content += stop_seq;
            return message;
        });

        let model = this.model_name || 'sweaterdog/andy-4:micro-q8_0';
        let res = null;

        try {
            console.log('Awaiting ollama api response from model', model);
            const apiResponse = await this.send(this.chat_endpoint, {
                model: model,
                messages: messages,
                stream: false,
                ...(this.params || {})
            });

            if (apiResponse && apiResponse.message) {
                res = apiResponse.message.content;
            } else {
                res = 'No response data.';
            }


            let stop_seq_index = res.indexOf(stop_seq);
            res = stop_seq_index !== -1 ? res.slice(0, stop_seq_index) : res;

            res = res.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        }
        catch (err) {
            if ((err.message?.toLowerCase().includes('context length')) && turns.length > 1) {
                console.log('Context length exceeded, trying again with shorter context.');
                return await this.sendRequest(turns.slice(1), systemMessage, stop_seq);
            } else {
                console.log(err);
                res = 'My brain disconnected, try again.';
            }
        }

        return res;
    }

    async sendVisionRequest(messages, systemMessage, imageBuffer) {
        const imageMessages = [...messages];
        imageMessages.push({
            role: "user",
            content: [
                { type: "text", text: systemMessage },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:image/jpeg;base64,${imageBuffer.toString('base64')}`
                    }
                }
            ]
        });

        return this.sendRequest(imageMessages, systemMessage);
    }

    async embed(text) {
        let model = this.model_name || 'embeddinggemma';
        let body = { model: model, input: text };
        const res = await this.send(this.embedding_endpoint, body);
        return res['embedding'];
    }

    async send(endpoint, body) {
        const url = new URL(endpoint, this.url);
        const method = 'POST';
        const headers = new Headers();

        if (this.url.includes('ollama.com') && hasKey('OLLAMA_API_KEY')) {
            headers.set('Authorization', `Bearer ${getKey('OLLAMA_API_KEY')}`);
        }

        headers.set('Content-Type', 'application/json');

        const request = new Request(url, {
            method,
            headers,
            body: JSON.stringify(body)
        });

        let data = null;
        try {
            const res = await fetch(request);
            if (res.ok) {
                data = await res.json();
            } else {
                throw new Error(`Ollama Status: ${res.status}`);
            }
        } catch (err) {
            console.error('Failed to send Ollama request.');
            console.error(err);
        }
        return data;
    }
}
