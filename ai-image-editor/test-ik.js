const ImageKit = require("imagekit");

const imagekit = new ImageKit({
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY || "public_aDOTywKZAAZcoFEPCZQhf1j5zQc=",
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "private_MhAT//Bm3j5iMQ6jgnkkPJC9lyU=",
  urlEndpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT || "https://ik.imagekit.io/tudemzwhq",
});

async function run() {
  try {
    const fetchModule = require('node-fetch');
    const imgRes = await fetchModule('https://images.unsplash.com/photo-1542204165-65bf26472b9b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80');
    const buffer = await imgRes.buffer();
    
    console.log("Uploading...");
    const uploadResp = await imagekit.upload({
      file: buffer,
      fileName: "real_test_bg_remove.jpg",
    });
    console.log("Uploaded URL:", uploadResp.url);

    const testUrl = uploadResp.url + "?tr=e-bgremove";
    console.log("Testing:", testUrl);

    const startTime = Date.now();
    for (let i = 0; i < 10; i++) {
        const res = await fetchModule(testUrl, { method: 'HEAD' });
        console.log(`[${(Date.now() - startTime)}ms] Status:`, res.status);
        if (res.status === 200) {
            console.log("Ready!");
            break;
        }
        await new Promise(r => setTimeout(r, 2000));
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

run();
