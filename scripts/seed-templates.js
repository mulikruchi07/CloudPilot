// scripts/seed-templates.js
// Auto-seed ALL JSON workflow templates into Supabase

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Admin Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Folder where your workflow JSON files exist
const TEMPLATE_FOLDER = path.join(__dirname, "../workflow-templates");

// ----------------------------------------------------
// Helper: Scan folder recursively and get all JSON files
// ----------------------------------------------------
function getAllJsonFiles(dir) {
  let results = [];

  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      results = results.concat(getAllJsonFiles(fullPath));
    } else if (file.endsWith(".json")) {
      results.push(fullPath);
    }
  }

  return results;
}

// ----------------------------------------------------
// Helper: Detect Category from folder name
// ----------------------------------------------------
function detectCategory(filePath) {
  if (filePath.includes("aws")) return "AWS Automation";
  if (filePath.includes("gcp")) return "Google Cloud Automation";
  if (filePath.includes("azure")) return "Azure Automation";
  return "General Automation";
}

// ----------------------------------------------------
// MAIN SEED FUNCTION
// ----------------------------------------------------
async function seedAllTemplates() {
  console.log("\n🌱 Seeding ALL workflow templates...\n");

  const jsonFiles = getAllJsonFiles(TEMPLATE_FOLDER);

  console.log(`📂 Found ${jsonFiles.length} workflow JSON files\n`);

  for (const filePath of jsonFiles) {
    try {
      const jsonRaw = fs.readFileSync(filePath, "utf8");
      const workflowJson = JSON.parse(jsonRaw);

      // Template Name from workflow JSON
      const name = workflowJson.name || path.basename(filePath);

      // Generate template_id from filename
      const template_id = path
        .basename(filePath)
        .replace(".json", "")
        .toLowerCase()
        .replace(/\s+/g, "-");

      // Detect category
      const category = detectCategory(filePath);

      // Extract node count for description
      const nodeCount = workflowJson.nodes?.length || 0;

      console.log(`📦 Uploading: ${name}`);
      console.log(`   → Nodes: ${nodeCount}`);
      console.log(`   → Category: ${category}`);

      // Insert into Supabase DB
      const { error } = await supabase
        .from("workflow_templates")
        .upsert(
          {
            template_id,
            name,
            description: `Imported workflow with ${nodeCount} nodes.`,
            category,
            icon: "fa-bolt",
            template_json: workflowJson,
            required_credentials: [],
            config_fields: [],
            tags: [category.toLowerCase()],
            is_active: true,
          },
          { onConflict: "template_id" }
        );

      if (error) {
        console.log("   ❌ Error:", error.message);
      } else {
        console.log("   ✅ Seeded successfully!\n");
      }
    } catch (err) {
      console.log("❌ Failed:", filePath);
      console.log("   Reason:", err.message, "\n");
    }
  }

  console.log("🎉 All templates seeded successfully!");
}

// Run script
seedAllTemplates();
