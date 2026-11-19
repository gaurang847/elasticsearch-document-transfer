#!/usr/bin/env node

/**
 * Helper script to seed Elasticsearch with test data and custom mappings.
 * Usage: node test/e2e/seed.js [nodeUrl] [indexName] [docCount]
 */

const { createClient, pingClient } = require('../../lib/client/clientFactory');

const NODE_URL = process.argv[2] || 'http://localhost:9200';
const INDEX_NAME = process.argv[3] || 'source_test_index';
const DOC_COUNT = parseInt(process.argv[4] || '1000', 10);

async function seed() {
  console.log(`Connecting to Elasticsearch at ${NODE_URL}...`);
  const client = createClient({ node: NODE_URL });

  const ping = await pingClient(client, 'Test ES');
  console.log(`✓ Connected to ${ping.distribution} v${ping.version}`);

  // Delete index if exists
  const exists = await client.indices.exists({ index: INDEX_NAME });
  const indexExists = typeof exists === 'boolean' ? exists : (exists.body ?? Boolean(exists));

  if (indexExists) {
    console.log(`Deleting existing index [${INDEX_NAME}]...`);
    await client.indices.delete({ index: INDEX_NAME });
  }

  // Create index with mapping
  console.log(`Creating index [${INDEX_NAME}] with schema...`);
  await client.indices.create({
    index: INDEX_NAME,
    body: {
      mappings: {
        properties: {
          id: { type: 'keyword' },
          title: { type: 'text' },
          category: { type: 'keyword' },
          price: { type: 'float' },
          quantity: { type: 'integer' },
          tags: { type: 'keyword' },
          metadata: {
            properties: {
              author: { type: 'keyword' },
              rating: { type: 'float' },
            },
          },
          createdAt: { type: 'date' },
        },
      },
    },
  });

  // Seed batches using bulk
  console.log(`Seeding ${DOC_COUNT} documents into [${INDEX_NAME}]...`);
  const batchSize = 250;
  const categories = ['Electronics', 'Books', 'Clothing', 'Home', 'Toys'];
  let seeded = 0;

  for (let i = 0; i < DOC_COUNT; i += batchSize) {
    const operations = [];
    const currentBatchSize = Math.min(batchSize, DOC_COUNT - i);

    for (let j = 0; j < currentBatchSize; j++) {
      const docId = `item-${i + j + 1}`;
      const doc = {
        id: docId,
        title: `Product #${i + j + 1}`,
        category: categories[(i + j) % categories.length],
        price: parseFloat(((i + j + 1) * 1.5).toFixed(2)),
        quantity: ((i + j) % 50) + 1,
        tags: [`tag-${(i + j) % 5}`, 'sample'],
        metadata: {
          author: `User_${(i + j) % 10}`,
          rating: parseFloat((((i + j) % 5) + 0.5).toFixed(1)),
        },
        createdAt: new Date(Date.now() - (i + j) * 3600000).toISOString(),
      };

      operations.push({ index: { _index: INDEX_NAME, _id: docId } });
      operations.push(doc);
    }

    await client.bulk({ operations, refresh: true });
    seeded += currentBatchSize;
    process.stdout.write(`\rSeeded ${seeded}/${DOC_COUNT} documents...`);
  }

  console.log(`\n✓ Seeding complete! Total documents in [${INDEX_NAME}]: ${DOC_COUNT}\n`);
}

seed().catch(err => {
  console.error(`\n❌ Seeding failed: ${err.message}`);
  process.exit(1);
});
