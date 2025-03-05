import fetch from "node-fetch";

async function testGemini() {
  const API_KEY = "AIzaSyCvW-s2PNc8vAT7jrB0x3joVaXuifyEE1w"; // Reemplaza con tu API Key válida
  const url = `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${API_KEY}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "¿Qué es Gemini AI?" }] }]
      }),
    });

    const data = await response.json();
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error en la solicitud:", error);
  }
}

testGemini();
