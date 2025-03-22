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

    analyzeHairImages: async (imagePath1, imagePath2, prompt = `
                Actúa como un tricólogo profesional con más de 20 años de experiencia en el diagnóstico y tratamiento de problemas capilares.
                Analiza las dos imágenes proporcionadas: una del cuero cabelludo y otra de la hebra capilar.

                **Análisis del cuero cabelludo:**
                - Determina el tipo de cuero cabelludo (seco, graso, mixto o normal).
                - Evalúa la presencia de condiciones como caspa, enrojecimiento, irritación, inflamación o signos de alopecia.
                - Describe cualquier anomalía visible en la textura o color del cuero cabelludo.

                **Análisis de la hebra capilar:**
                - Describe la textura del cabello (liso, ondulado, rizado o afro).
                - Evalúa el grosor del cabello (fino, medio o grueso).
                - Determina el estado general del cabello (hidratado, seco, dañado, quebradizo, poroso, con frizz, puntas abiertas o si está teñido).
                - Identifica cualquier daño visible en la cutícula del cabello.

                **Formato de la respuesta:**
                - **Condición del cuero cabelludo:** [Descripción detallada].
                - **Estado del cabello:** [Descripción detallada].
                - **Recomendaciones:** [Lista de recomendaciones personalizadas para el cuidado capilar].

                **Ejemplo de respuesta esperada:**
                - **Condición del cuero cabelludo:** [Ejemplo de diagnóstico].
                - **Estado del cabello:** [Ejemplo de diagnóstico].
                - **Recomendaciones:** [Ejemplo de recomendaciones].
                `) => {
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
                const basePrompt = `
                        Actúa como un experto asesor de belleza capilar con un profundo conocimiento en el cuidado del cabello y el cuero cabelludo.
                        Responde a la siguiente pregunta del usuario de manera clara, concisa y profesional:
                        `;
                parts.push({ text: basePrompt + imageParts });
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