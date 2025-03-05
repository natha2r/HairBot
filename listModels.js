import fetch from "node-fetch";

async function listModels() {
  const apiKey = "AIzaSyCvW-s2PNc8vAT7jrB0x3joVaXuifyEE1w";
  const url = `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error("Error:", error);
  }
}

listModels();
