const mongoose = require('mongoose');

// $inc inside findOneAndUpdate is a single atomic step, so two receptionists saving at once still get different numbers
async function nextSequence(name) {
  const counters = mongoose.connection.collection('counters');
  const counter = await counters.findOneAndUpdate(
    { _id: name },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  return counter.value;
}

module.exports = nextSequence;
