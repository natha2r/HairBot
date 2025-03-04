import path from "path";
import { google } from "googleapis";

const sheets = google.sheets("v4");

async function addRowToSheet(auth, spreadsheetId, values) {
  const request = {
    spreadsheetId,
    range: "reservas",
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    resource: {
      values: [values],
    },
    auth,
  };

  try {
    const response = await sheets.spreadsheets.values.append(request).data;
    return response;
  } catch (error) {
    console.error(error);
  }
}

const appendToSheet = async (data) => {
  try {
    const auth = new google.auth.GoogleAuth({
      keyFile: path.join(process.cwd(), "src/credentials", "credentials.json"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const authClient = await auth.getClient();
    const spreadsheetId = "1PBN_Q82K5k7LG66zIQhlcPo18iyWzH_BHWRi8RR178A";

    await addRowToSheet(authClient, spreadsheetId, data);
    return "Datos correctamente agregados";
  } catch (error) {
    console.error(error);
  }
};

export default appendToSheet;
