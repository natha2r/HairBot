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
    analyzeHairImage: async (imagePath, prompt = "Eres un dermatólogo especializado en tricología (salud del cabello y cuero cabelludo). Analiza detalladamente esta imagen del cuero cabelludo. Describe cualquier condición visible como: caspa, enrojecimiento, irritación, calvicie, adelgazamiento del cabello, o anomalías en la textura del cuero cabelludo.") => {
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

    analyzeHairImages: async (imagePath1, imagePath2, prompt = `Actúa como un tricólogo profesional. Analiza las dos imágenes proporcionadas: una del cuero cabelludo y otra de la hebra capilar.
                            Cuero Cabelludo: Determina el tipo de cuero cabelludo (seco, graso, mixto o normal) y evalúa la presencia de caspa, enrojecimiento, irritación, inflamación o signos de alopecia.
                            Fibra Capilar: Describe la textura (liso, ondulado, rizado o afro), grosor (fino, medio o grueso) y estado general del cabello (hidratado, seco, dañado, quebradizo, poroso, con frizz, puntas abiertas o si está teñido).
                            Proporciona un diagnóstico detallado y recomendaciones de tratamiento o cuidado capilar personalizadas basadas en tu análisis.`) => {
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
                const basePrompt = "Como un experto asesor de belleza capilar, responde a la siguiente pregunta del usuario: ";
                parts.push({text: basePrompt + imageParts});
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