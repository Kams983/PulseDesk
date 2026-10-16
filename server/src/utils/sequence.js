const mongoose = require('mongoose');

// $inc inside findOneAndUpdate is one atomic step, so two receptionists saving at once still get
// different numbers.
async function nextSequence(name) {
  const counters = mongoose.connection.collection('counters');

  try {
    return await increment(counters, name);
  } catch (error) {
    // The first increment of a counter is an upsert, and two of those arriving together can both try to
    // insert the same _id. The document exists by then, so one retry increments it for real. Without
    // this, twenty parallel bookings could fail on the patient code.
    if (error.code !== 11000) {
      throw error;
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
