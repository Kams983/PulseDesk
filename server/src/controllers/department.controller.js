const departmentService = require('../services/departmentService');
const { sendSuccess } = require('../utils/response');

async function listDepartments(req, res) {
  const departments = await departmentService.listDepartments();

  return sendSuccess(res, {
    data: {
      departments: departments.map((department) => ({
        id: department._id.toString(),
        name: department.name,
        code: department.code,
      })),
    },
    meta: { total: departments.length },
  });
}

module.exports = { listDepartments };
