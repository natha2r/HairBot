import { GoogleGenerativeAI } from "@google/generative-ai";
import config from "../config/env.js";
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY, { apiVersion: "v1" });

async function fileToGenerativePart(path, mimeType) {
    try {
        const file = await fs.readFile(path);
        const base64Encoded = Buffer.from(file).toString("base64");
        return {
            inlineData: { data: base64Encoded, mimeType }
        };
    } catch (error) {
        console.error("Error al leer el archivo:", error);
        throw error;
    }
}

const geminiService = {
    analyzeHairImage: async (imagePath, prompt = "Eres un experto en cuidado capilar y salud del cuero cabelludo.") => {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const imageParts = await fileToGenerativePart(imagePath, "image/jpeg");
            const parts = [imageParts, { text: prompt }];
            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.candidates[0].content.parts[0].text;
            return text;
        } catch (error) {
            console.error("Error en analyzeHairImage:", error);
            return "Hubo un error al analizar la imagen del cabello.";
        }
    },

    analyzeHairImages: async (imagePath1, imagePath2, prompt = "Eres un experto en cuidado capilar y salud del cuero cabelludo. Analiza detalladamente las dos imágenes proporcionadas y realiza un diagnóstico integral del estado del cuero cabelludo y del cabello. Evalúa el cuero cabelludo determinando si es seco, graso, mixto o normal, e identifica posibles afecciones como caspa, irritación, sensibilidad, inflamación o signos de caída. Examina la fibra capilar considerando su textura (liso, ondulado, rizado o afro), su grosor (fino, medio o grueso) y su estado general (hidratado, seco, dañado, quebradizo, poroso, con frizz, con puntas abiertas o teñido).") => {
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const imageParts1 = await fileToGenerativePart(imagePath1, "image/jpeg");
            const imageParts2 = await fileToGenerativePart(imagePath2, "image/jpeg");
            const parts = [imageParts1, imageParts2, { text: prompt }];
            const result = await model.generateContent(parts);
            const response = await result.response;
            const text = response.candidates[0].content.parts[0].text;
            return text;
        } catch (error) {
            console.error("Error en analyzeHairImages:", error);
            return "Hubo un error al analizar las imágenes del cabello.";
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