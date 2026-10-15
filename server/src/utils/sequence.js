const mongoose = require('mongoose');

// $inc inside findOneAndUpdate is a single atomic step, so two receptionists saving at once still get
// different numbers
async function nextSequence(name) {
  const counters = mongoose.connection.collection('counters');

  try {
    return await increment(counters, name);
  } catch (err) {
    // The very first increment of a counter is an upsert, and two of those arriving together can both
    // try to insert the same _id, which mongodb reports as a duplicate key error even though the
    // caller did nothing wrong. The document exists by now, so a single retry finds it and increments
    // it for real. Without this, twenty bookings created in parallel could fail on the patient code.
    if (err.code !== 11000) {
      throw err;
    }

    return increment(counters, name);
  }
}

async function increment(counters, name) {
  const counter = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  return counter.value;
}

module.exports = nextSequence;
