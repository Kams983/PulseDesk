const Department = require('../models/department.model');

// departments are a short fixed list, so it is always returned whole and never paginated
async function listDepartments() {
  return Department.find({}).select('name code').sort({ name: 1 }).lean();
}

module.exports = { listDepartments };
