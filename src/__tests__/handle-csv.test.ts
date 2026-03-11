import { execFileSync } from "child_process";
import fs from "fs/promises";
import os from "os";
import path from "path";

describe("handle-csv.sh", () => {
  test("forces 06mqq goalie rows to position G without changing unrelated rows", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ffhl-handle-csv-"));
    const inputPath = path.join(tempDir, "input.csv");
    const outputPath = path.join(tempDir, "output.csv");
    const scriptPath = path.resolve(process.cwd(), "scripts", "handle-csv.sh");

    const rawCsv = [
      '"","Goalies"',
      '"","ID","Pos","Player","Team","Eligible","Status","Opponent","GP","W-G","GAA","SV","SV%","SHO","PIM","G","A","Pt","PPP","SHP"',
      '"*06mqq*","D","Denis Gabdrakhmanov","FLA","G","Min","","0","0",".00","0",".000","0","0","0","0","0","0","0"',
      '"*g002*","G","Stable Goalie","COL","G","Min","","1","1","2.00","20",".950","0","0","0","0","0","0","0"',
      "",
    ].join("\n");

    try {
      await fs.writeFile(inputPath, rawCsv, "utf8");

      execFileSync("bash", [scriptPath, inputPath, outputPath], {
        encoding: "utf8",
      });

      const output = await fs.readFile(outputPath, "utf8");

      expect(output).toContain(
        '"*06mqq*","G","Denis Gabdrakhmanov","FLA","G","Min","","0","0",".00","0",".000","0","0","0","0","0","0","0"',
      );
      expect(output).toContain(
        '"*g002*","G","Stable Goalie","COL","G","Min","","1","1","2.00","20",".950","0","0","0","0","0","0","0"',
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
