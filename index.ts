import { exec } from "child_process";
import * as fs from "fs";
import * as http from "http";
import * as https from "https";
import { URL } from "url";
import * as util from "util";
import { v4 as uuidv4 } from "uuid";

const execPromise = util.promisify(exec);
interface TTSServResponse {
  reqID: string;
  code: number;
  message: string;
  operation: string;
  sequence: number;
  data: string;
}

const token = "TOKEN"; // Replace with your actual Bearer token
const appid = "APP_ID"; // Replace with your actual APP ID

async function httpPost(
  url: string,
  headers: { [key: string]: string },
  body: Buffer,
  timeout: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: http.RequestOptions | https.RequestOptions = {
      method: "POST",
      headers: headers,
      timeout: timeout,
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
    };

    const protocol = urlObj.protocol === "https:" ? https : http;

    const req = protocol.request(options, (res) => {
      let data: Buffer[] = [];

      res.on("data", (chunk) => {
        data.push(chunk);
      });

      res.on("end", () => {
        const retBody = Buffer.concat(data);
        resolve(retBody);
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(body);
    req.end();
  });
}

async function synthesis(text: string): Promise<Buffer> {
  const reqID = uuidv4();
  const params: { [key: string]: { [key: string]: any } } = {
    app: {
      appid,
      token,
      cluster: "volcano_tts",
    },
    user: {
      uid: "uid",
    },
    audio: {
      voice_type: "zh_female_shuangkuaisisi_moon_bigtts",
      encoding: "wav",
      speed_ratio: 1.0,
      volume_ratio: 1.0,
      pitch_ratio: 1.0,
    },
    request: {
      reqid: reqID,
      text: text,
      text_type: "plain",
      operation: "query",
    },
  };

  const headers: { [key: string]: string } = {
    "Content-Type": "application/json",
    Authorization: `Bearer;${token}`, // bearerToken为saas平台对应的接入认证中的Token
  };

  const url = "https://openspeech.bytedance.com/api/v1/tts";
  const timeout = 30000; // 30 seconds
  const bodyStr = JSON.stringify(params);

  try {
    const synResp = await httpPost(url, headers, Buffer.from(bodyStr), timeout);

    const respJSON: TTSServResponse = JSON.parse(synResp.toString());
    const code = respJSON.code;

    if (code !== 3000) {
      console.error(`code fail [code:${code}]`);
      throw new Error("resp code fail");
    }

    const audio = Buffer.from(respJSON.data, "base64");
    return audio;
  } catch (err: any) {
    console.error(`http post fail [err:${err.message}]`);
    throw err;
  }
}

async function convertWavToMp3(
  wavFilePath: string,
  mp3FilePath: string
): Promise<void> {
  try {
    // Ensure ffmpeg is installed.  You might need to adjust the path.
    const command = `ffmpeg -i ${wavFilePath} ${mp3FilePath}`;
    const { stdout, stderr } = await execPromise(command);
    if (stderr) {
      console.error("stderr:", stderr);
    }
    console.log(`Successfully converted ${wavFilePath} to ${mp3FilePath}`);
  } catch (error: any) {
    console.error(`Error converting WAV to MP3: ${error.message}`);
    throw error;
  }
}

async function main() {
  const text = "text to synthesise";
  try {
    const audio = await synthesis(text);
    console.log(`get audio succ len[${audio.length}]`);

    const wavFileName = "output4.wav";
    fs.writeFileSync(wavFileName, audio);
    console.log(`WAV file saved as ${wavFileName}`);

    const mp3FileName = "output4.mp3";
    await convertWavToMp3(wavFileName, mp3FileName);
    console.log(`MP3 file saved as ${mp3FileName}`);
  } catch (err: any) {
    console.error(`synthesis fail [err:${err.message}]`);
  }
}

main();
