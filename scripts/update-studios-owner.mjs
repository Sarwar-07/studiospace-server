import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import dotenv from 'dotenv';
dotenv.config();

import { MongoClient } from 'mongodb';

async function updateStudios() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || 'studiospace_db';
  const targetEmail = 'svenbrunner000@gmail.com';

  console.log(`Connecting to MongoDB database: "${dbName}"...`);
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db(dbName);
    const studiosCollection = db.collection('studios');

    const totalBefore = await studiosCollection.countDocuments({});
    console.log(`Total studio documents found in "${dbName}.studios": ${totalBefore}`);

    const result = await studiosCollection.updateMany(
      {},
      {
        $set: {
          ownerEmail: targetEmail,
          hostEmail: targetEmail,
        },
      }
    );

    console.log('\n--- Update Results ---');
    console.log(`Matched documents: ${result.matchedCount}`);
    console.log(`Modified documents: ${result.modifiedCount}`);
    console.log(`Acknowledged: ${result.acknowledged}`);

    // Fetch and display a sample document to verify
    const sample = await studiosCollection.findOne({});
    console.log('\nSample updated document preview:');
    console.log({
      _id: sample?._id,
      title: sample?.title,
      ownerEmail: sample?.ownerEmail,
      hostEmail: sample?.hostEmail,
    });
  } catch (error) {
    console.error('Error updating studios:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nDatabase connection closed.');
  }
}

updateStudios();
