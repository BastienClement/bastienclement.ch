import * as functions from "firebase-functions";
import * as express from "express";

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

const app = express();

app.get("/", (req, res) => {
    const date = new Date();
    res.send(`
        <style>body { font-family: monospace; }</style>
        <h1>api.bastienclement.ch</h1>
        <p><em>${date.toISOString()}</em></p>
    `);
});

//
// Pocket Timbreuse
//

import * as crypto from "crypto";
import * as https from "https";
import { IncomingMessage } from "http";

const APP_KEY = "06abcd83d32e8da23474ccb69285dee559077ff7";

const getAuthHeader = (secret: string, timestamp: number) => {
    const hash = crypto.createHash("sha1");
    hash.update(secret);
    hash.update(`${timestamp}`);
    return `FORUM-TOKEN timestamp=${timestamp} hash=${hash.digest('hex')} app=${APP_KEY}`;
}

type RequestResult = {
    response: IncomingMessage;
    body: string;
}

const responseText = (direction: string) => {
    return ((direction == "in") ? "Vous êtes entré à " : "Vous êtes sorti à ") +
        new Date().toLocaleTimeString("fr-FR", { timeZone: 'Europe/Zurich' });
}

app.post("/pocket-timbreuse/timecheck", async (req, res) => {
    const instance = <string>req.query.instance;
    const secret = <string>req.query.secret;
    const timestamp = Date.now() / 1000 | 0;

    const personId = parseInt(<string>req.query.person, 10);

    if (!instance || !secret || !personId) {
        res.status(400).end();
        return;
    }

    const result = await new Promise<RequestResult>((res, rej) => {
        const req = https.request({
            host: `${instance}.tipee.net`,
            method: "POST",
            path: "/api/timeclock/timechecks",
            headers: {
                "Authorization": getAuthHeader(secret, timestamp),
                "Content-Type": "application/json"
            },
        }, (response) => {
            let buffer = "";
            response.setEncoding("utf8");
            response.on("data", (chunk) => buffer += chunk);
            response.on("end", () => res({ response, body: buffer }));
        });

        req.on("error", rej);
        req.write(JSON.stringify({
            external_id: 0,
            person: personId,
            time: timestamp,
            timeclock: "PocketTimbreuse",
        }));
        req.end();
    });

    console.log("Status code", result.response.statusCode);
    console.log("Direction:", result.response.headers["timecheck-direction"]);
    console.log("Body:", result.body);

    const success = result.response.statusCode == 201;
    const direction = success ? result.response.headers["timecheck-direction"] : null;

    res
        .status(success ? (direction == "in" ? 201 : 200) : <number>result.response.statusCode)
        .header("Content-Type", "text/plain; charset=utf-8")
        .send(success ? responseText(<string>direction) : result.body);
});

//
// Export handler
//

export const api = functions
    .runWith({ timeoutSeconds: 30, memory: "128MB" })
    .https.onRequest(app);
