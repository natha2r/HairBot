import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/env.js";
import fs from 'fs';

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY, { apiVersion: "v1" });

async function fileToGenerativePart(path, mimeType) {
    const file = await fs.promises.readFile(path);
    const base64Encoded = Buffer.from(file).toString("base64");
    return {
        inlineData: { data: base64Encoded, mimeType }
    };
}

const geminiService = {
    analyzeHairImage: async (imagePath, prompt = "Analiza el estado del cuero cabelludo y el cabello en esta imagen. Indica si el cuero cabelludo es seco, graso o normal, si hay signos de caspa, irritación o caída. Describe la textura del cabello (liso, ondulado, rizado), su grosor (fino, medio, grueso), y su estado general (hidratado, seco, dañado, teñido, con puntas abiertas). Brinda recomendaciones para su cuidado según el análisis.") => { 
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const imageParts = await fileToGenerativePart(imagePath, "image/jpeg");
            const parts = [
                imageParts,
                { text: prompt } //Se agrega el prompt como texto
            ];

            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.candidates[0].content.parts[0].text;
            return text;

        } catch (error) {
            console.error("Error en analyzeHairImage:", error);
            return "Hubo un error al analizar la imagen del cabello.";
        }
    },

    generalQuery: async (message, imagePath) => {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

            let parts = [];

            if (imagePath) {
                const imageParts = await fileToGenerativePart(imagePath, "image/jpeg");
                parts.push(imageParts);
            }

            parts.push({ text: message });

            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.candidates[0].content.parts[0].text;
            return text;

        } catch (error) {
            console.error("Error en Gemini generalQuery:", error);
            return "Hubo un error con la IA.";
        }
    }
};

export default geminiService;