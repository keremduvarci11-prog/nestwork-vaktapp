import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { build } from "esbuild";

async function harness(native: boolean, plugins = true) {
  const writes: any[] = [];
  const shares: any[] = [];
  const context = vm.createContext({
    mocks: {
      Capacitor: { isNativePlatform: () => native, isPluginAvailable: () => plugins },
      Directory: { Cache: "CACHE" },
      Filesystem: { writeFile: async (file: any) => { writes.push(file); return { uri: "file:///cache/synthetic.pdf" }; } },
      Share: { share: async (options: any) => { shares.push(options); } },
    },
    FileReader: class {
      result = "data:application/pdf;base64,c3ludGhldGlj";
      onload?: () => void;
      readAsDataURL() { this.onload?.(); }
    },
  });
  const result = await build({
    entryPoints: ["client/src/lib/share-pdf.ts"], bundle: true, write: false,
    format: "iife", globalName: "pdfShare",
    plugins: [{
      name: "isolated-native-plugins",
      setup(builder) {
        builder.onResolve({ filter: /^@capacitor\// }, args => ({ path: args.path, namespace: "mock" }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents: "export const {Capacitor,Filesystem,Directory,Share}=mocks;",
        }));
      },
    }],
  });
  vm.runInContext(result.outputFiles[0].text, context);
  return { share: context.pdfShare.shareNativePdf, writes, shares };
}

test("web PDF downloads do not call native plugins", async () => {
  const h = await harness(false);
  assert.equal(await h.share({}, "slip.pdf"), false);
  assert.equal(h.writes.length, 0);
});

test("native PDF shares a sanitized cache file with base64 binary data", async () => {
  const h = await harness(true);
  assert.equal(await h.share({}, "../lønn/2026.pdf"), true);
  assert.equal(h.writes[0].directory, "CACHE");
  assert.equal(h.writes[0].data, "c3ludGhldGlj");
  assert.ok(!h.writes[0].path.includes("/"));
  assert.equal(h.writes[0].encoding, undefined);
  assert.equal(h.shares[0].files[0], "file:///cache/synthetic.pdf");
});

test("older native binaries fail with an actionable update message", async () => {
  const h = await harness(true, false);
  await assert.rejects(h.share({}, "slip.pdf"), /Oppdater Nestwork-appen/);
  assert.equal(h.writes.length, 0);
});
