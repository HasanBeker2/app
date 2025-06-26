const { exec } = require('child_process');
const fs = require('fs-extra');

async function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                return reject(error);
            }
            console.log(`stdout: ${stdout}`);
            console.error(`stderr: ${stderr}`);
            resolve(stdout);
        });
    });
}

async function main() {
    const cities = process.argv.slice(2);

    if (cities.length === 0) {
        console.log('Usage: node run_all.js [city1] [city2] ...');
        console.log('Example: node run_all.js Berlin München Hamburg');
        return;
    }

    // Ensure output directories exist
    await fs.ensureDir('./json_output');
    await fs.ensureDir('./csv_output');

    for (const city of cities) {
        console.log(`\n=== Processing ${city} ===`);

        // Step 1: Run scraper.js
        console.log(`Running scraper for ${city}...`);
        await runCommand(`node scraper.js ${city}`);

        // Step 2: Generate WhatsApp links
        console.log(`Generating WhatsApp links for ${city}...`);
        await runCommand(`node whatsapp_link_generator.js ${city}`);

        // Step 3: Scrape Instagram links
        console.log(`Scraping Instagram links for ${city}...`);
        await runCommand(`node instagram_scraper.js ${city}`);

        console.log(`=== Finished processing ${city} ===\n`);
    }

    console.log('All cities processed.');
}

main();
