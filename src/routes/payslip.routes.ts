import { FastifyInstance, FastifyPluginOptions, FastifyRequest } from 'fastify';
import { RouteHandler } from '../types/routes';
import { authenticate } from '../middleware/auth';


// interface PayslipGen {
//   month: number;
//   year: number;
// }
interface getPayslipRequestBody {
  userIds: string[];
  month: number;
  year: number;
}

interface PayslipGenerateRequest {
  monthYear: string; // YYYY-MM
  userIds?: string[];
  filters?: {
    departmentId?: string;
    role?: string;
    status?: string;
    search?: string;
  };
}


interface CheckPayslipGenRequest {
  Querystring: {
    month: number;
    year: number;
  }
}


export const payslipRoutes: RouteHandler = async (
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions,
): Promise<void> => {

  //generate payslip
  fastify.post(
    '/bulk-generate',
    {
      onRequest: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['monthYear'],
          properties: {
            monthYear: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}$',
              description: 'Month and Year in YYYY-MM format',
            },
            userIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of user IDs',
            },
            filters: {
              type: 'object',
              description: 'Optional filter criteria for bulk payslip generation',
              properties: {
                departmentId: { type: 'string' },
                role: { type: 'string' },
                status: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Statuses like Active, On Hold, Resigned',
                },
                search: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
          oneOf: [
            { required: ['userIds'] },
            { required: ['filters'] },
          ],
        },
      },
    },
    async (request, reply) => {
      try {
        const { monthYear, userIds, filters } = request.body as PayslipGenerateRequest;
        const [yearStr, monthStr] = monthYear.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);

        if (year < 2024 || year > 2100 || month < 1 || month > 12) {
          return reply.status(400).send({
            success: false,
            error: { message: '❌ Invalid monthYear format or range.' },
          });
        }

        let finalUserIds: string[];
        if (userIds) {
          finalUserIds = userIds;
        } else {
          const finalFilters = {
            ...filters,
            status: Array.isArray(filters?.status) && filters.status.length > 0
              ? filters.status
              : ['Active', 'Resigned'],
          };
          finalUserIds = await request.container!.payrollService.getUserIdsByFilters(finalFilters, monthYear, 'onlyCompleted');
        }
        console.log(finalUserIds, "finalUserIds")
        if (!finalUserIds || finalUserIds.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { message: 'No employees found for processing payslips.' },
          });
        }

        const salary = await request.container!.payslipService.bulkGenerate(
          month,
          year,
          finalUserIds
        );

        return reply.send({
          success: true,
          data: salary,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );
  //me get payslip 
  fastify.get("/me", async (request: FastifyRequest<{ Querystring: { month?: number, year?: number, userId: string } }>, reply) => {
    try {
      // const user = request.user as any;
      // console.log(user, "user me")
      const { month, year, userId } = request.query;
      // const userId = (request.user as any)._id;
      console.log(month, year, userId, "query params")
      const result = await request.container!.payslipService.getEmployeePayslipAndPayroll(userId, month, year);
      console.log(result, "getEmployeePayslipAndPayroll result")
      return reply.send({
        success: true,
        data: result
      });
    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  })

  //send mail
  fastify.post("/send",
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Payslip'],
        summary: 'Send payslips via email',
        description: 'Send generated payslips to specified recipients via email',
        body: {
          type: 'object',
          required: ['monthYear'],
          properties: {
            monthYear: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}$',
              description: 'Month and Year in YYYY-MM format',
            },
            userIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of user IDs',
            },
            filters: {
              type: 'object',
              description: 'Optional filter criteria for bulk payslip generation',
              properties: {
                departmentId: { type: 'string' },
                role: { type: 'string' },
                status: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Statuses like Active, On Hold, Resigned',
                },
                search: { type: 'string' },
              },
              additionalProperties: false,
            },
          },
          oneOf: [
            { required: ['userIds'] },
            { required: ['filters'] },
          ],
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  successCount: { type: 'number' },
                  failedCount: { type: 'number' },
                  results: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        employeeId: { type: 'string' },
                        status: { type: 'string', enum: ['success', 'failed'] },
                        message: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      console.log("request request.body", request.body)


      try {
        const { monthYear, userIds, filters } = request.body as PayslipGenerateRequest;
        const [yearStr, monthStr] = monthYear.split('-');
        const year = Number(yearStr);
        const month = Number(monthStr);
        if (year < 2024 || year > 2100 || month < 1 || month > 12) {
          return reply.status(400).send({
            success: false,
            error: { message: '❌ Invalid monthYear format or range.' },
          });
        }
        let finalUserIds: string[];
        if (userIds) {
          finalUserIds = userIds;
        } else {
          const finalFilters = {
            ...filters,
            status: Array.isArray(filters?.status) && filters.status.length > 0
              ? filters.status
              : ['Active'],
          };
          finalUserIds = await request.container!.payrollService.getUserIdsByFilters(finalFilters, monthYear, 'onlyCompleted');
        }
        console.log(finalUserIds, "finalUserIds")
        if (!finalUserIds || finalUserIds.length === 0) {
          return reply.status(404).send({
            success: false,
            error: { message: 'No employees found for processing payslips.' },
          });
        }
        const result = await request.container!.payslipService.sendPayslips(
          {
            month: month,
            year: year,
            recipients: finalUserIds
          },
          request.user._id as string,
        );
        console.log(result, "sendPayslip result")
        return reply.send({
          success: true,
          data: result
        });

      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    });


  //check payslip is generated
  fastify.get(
    '/is-generated',
    {
      schema: {
        tags: ['Payslip'],
        summary: 'Check if payslips are generated for a month',
        description: 'Checks if payslips have been generated for all payroll records in the specified month',
        querystring: {
          type: 'object',
          required: ['month', 'year'],
          properties: {
            month: {
              type: 'number',
              minimum: 1,
              maximum: 12,
              description: 'Month (1-12)'
            },
            year: {
              type: 'number',
              description: 'Year (YYYY)'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  generated: { type: 'boolean' },
                  payslips: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        employeeId: { type: 'string' },
                        employeeName: { type: 'string' },
                        payslipId: { type: 'string' },
                        payslipUrl: {
                          type: 'string',
                          nullable: true
                        },
                        status: { type: 'string' },
                        emailSent: { type: 'boolean' },
                        lastEmailSentAt: { type: 'string' }
                      }
                    }
                  },
                  summary: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      generated: { type: 'number' },
                      pending: { type: 'number' }
                    }
                  }
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: {
                type: 'object',
                properties: {
                  message: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<CheckPayslipGenRequest>, reply) => {
      try {
        const { month, year } = request.query;
        console.log(request.query, "query", month, year, "month-year")
        // const result = await request.container!.payslipService.checkPayslipGeneration(month, year);

        return reply.send({
          success: true,
          data: true
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  );

  // Get payroll records for specific users by month and year
  fastify.post('/by-users',
    {
      onRequest: [authenticate],
      schema: {
        body: {
          type: 'object',
          required: ['userIds', 'month', 'year'],
          properties: {
            userIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Array of user IDs to fetch payroll records for',
            },
            month: {
              type: 'number',
              minimum: 1,
              maximum: 12,
              description: 'Month for which payroll records are requested (1-12)',
            },
            year: {
              type: 'number',
              minimum: 2000,
              maximum: 2100,
              description: 'Year for which payroll records are requested (2000-2100)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' }, // payslip record ID
                    userId: { type: 'string' },
                    status: {
                      type: 'string',
                      enum: [
                        'Generated', 'Sent', 'Exported'
                      ]
                    },
                    payslipUrl: { type: 'string' },
                    isExport: { type: 'boolean' },
                    month: { type: 'number' },
                    year: { type: 'number' },
                    monthYear: { type: 'string', pattern: '^\\d{4}-\\d{2}$' }, // YYYY-MM format
                  },
                  required: ['_id', 'userId', 'status']
                },
              },
            },
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', default: false },
              message: { type: 'string' },
            },
          },
        },
      }
    },
    async (request, reply) => {
      console.log("inside /by-users route", request.body);
      const { userIds, month, year } = request.body as getPayslipRequestBody;;
      console.log(typeof month, typeof year, 'month and year types');
      const isUserIdsInvalid = !Array.isArray(userIds) || userIds.length === 0 || !userIds.every(id => typeof id === 'string');
      const isMonthInvalid = typeof month !== 'number' || month < 1 || month > 12;
      const isYearInvalid = typeof year !== 'number' || year < 2000 || year > 2100;

      console.log({ isUserIdsInvalid, isMonthInvalid, isYearInvalid });
      if (isUserIdsInvalid || isMonthInvalid || isYearInvalid) {
        return {
          success: false,
          message: 'Invalid request body: userIds (non-empty array of strings), month (1–12), and year (2000–2100) are required.'
        };
      }

      try {
        const data = await request.container!.payslipService.getPayslipRecordsForUsers(userIds, month, year);
        return reply.send({ success: true, data: data });
      } catch (error: any) {
        return reply.status(400).send({ success: false, error: error.message });
      }
    }
  );
  //delete payroll records by month and year
  fastify.delete(
    '/delete',
    async (request, reply) => {
      try {

        let { month, year } = request.query as { month: number; year: number };
        console.log(month, year, 'req query');
        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
          return reply.status(400).send({
            success: false,
            error: { message: 'Invalid monthYear format. Use YYYY-MM.' },
          });
        }
        const result: any = await request.container!.payslipService.deletePayroll(month, year);
        if (!result) {
          return reply.status(404).send({
            success: false,
            error: { message: 'No payroll records found for the specified month and year.' },
          });
        }
        console.log(result, 'result');

        return reply.send({
          success: true,
          data: result,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  )



  // Calculate monthly salary
  fastify.get(
    '/calculate/:month',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Payroll'],
        summary: 'Calculate monthly salary',
        description: 'Calculate salary for a specific month including all components and deductions',
        params: {
          type: 'object',
          required: ['month'],
          properties: {
            month: {
              type: 'string',
              pattern: '^\\d{4}-\\d{2}$',
              description: 'Month in YYYY-MM format'
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  userId: { type: 'string' },
                  month: { type: 'string' },
                  basic: { type: 'number' },
                  hra: { type: 'number' },
                  specialAllowance: { type: 'number' },
                  overtimeAmount: { type: 'number' },
                  grossSalary: { type: 'number' },
                  deductions: {
                    type: 'object',
                    properties: {
                      pf: { type: 'number' },
                      tax: { type: 'number' },
                      others: { type: 'number' }
                    }
                  },
                  netSalary: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const { month } = request.params as { month: string };
        console.log(month)
        // const salary = await salaryCalculatorService.calculateMonthlySalary(
        //   new Types.ObjectId((request.user as any)._id),
        //   month
        // );
        return reply.send({
          success: true,
          data: true,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );





  /*

    //send mail
  fastify.post("/send", async (request: FastifyRequest<{ Body: ISendPayslipsRequest }>, reply) => {
    console.log("request request.body", request.body)
    

    try {
      const result = await payslipService.sendPayslips(request.body);
      console.log(result, "sendPayslip result")
      return reply.send({
        success: true,
        data: result
      });

    } catch (error: any) {
      return reply.status(400).send({
        success: false,
        error: { message: error.message }
      });
    }
  });

//generate payslip
fastify.post('/bulk-generate', async (request:
  FastifyRequest<{ Body: PayslipGen }>, reply) => {
  try {
    const { month, year } = request.body;
    console.log(request.headers.host, "host")
    const salary = await payslipService.bulkGenerate(
      month, year, request.headers.host || 'localhost:5800'
    );
    return reply.send({
      success: true,
      data: salary,
    });
  } catch (error: any) {
    return reply.status(400).send({
      success: false,
      error: { message: error.message },
    });
  }
});
*/

  /*
  //send payslip
  fastify.post(
    '/send',
    // {
    //   schema: {
    //     tags: ['Payslip'],
    //     summary: 'Send payslips via email',
    //     description: 'Send generated payslips to specified recipients via email',
    //     body: {
    //       type: 'object',
    //       required: ['month', 'year', 'recipients'],
    //       properties: {
    //         month: {
    //           type: 'number',
    //           minimum: 1,
    //           maximum: 12,
    //           description: 'Month (1-12)'
    //         },
    //         year: {
    //           type: 'number',
    //           description: 'Year (YYYY)'
    //         },
    //         recipients: {
    //           type: 'array',
    //           items: {
    //             type: 'string',
    //             pattern: '^[0-9a-fA-F]{24}$'
    //           },
    //           minItems: 1,
    //           description: 'Array of user IDs to send payslips to'
    //         }
    //       }
    //     },
    //     response: {
    //       200: {
    //         type: 'object',
    //         properties: {
    //           success: { type: 'boolean' },
    //           data: {
    //             type: 'object',
    //             properties: {
    //               success: { type: 'number' },
    //               failed: { type: 'number' },
    //               results: {
    //                 type: 'array',
    //                 items: {
    //                   type: 'object',
    //                   properties: {
    //                     employeeId: { type: 'string' },
    //                     status: { type: 'string', enum: ['success', 'failed'] },
    //                     message: { type: 'string' }
    //                   }
    //                 }
    //               }
    //             }
    //           }
    //         }
    //       },
    //       400: {
    //         type: 'object',
    //         properties: {
    //           success: { type: 'boolean' },
    //           error: {
    //             type: 'object',
    //             properties: {
    //               message: { type: 'string' }
    //             }
    //           }
    //         }
    //       }
    //     }
    //   }
    // },
    async (request: FastifyRequest<{
      Body: ISendPayslipsRequest
    }>, reply) => {
      console.log("send")
      try {
        const result = await payslipService.sendPayslips(request.body);

        return reply.send({
          success: true,
          data: result
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message }
        });
      }
    }
  ); */

};



// interface IPayslipHistoryRequest {
//   Querystring: {
//     startDate?: string;
//     endDate?: string;
//     page?: number;
//     limit?: number;
//   }
// }
// interface IPayslipHistoryQuery {
//   userId?: string;
//   startDate?: Date;
//   endDate?: Date;
//   page?: number;
//   limit?: number;
// }
/* // import { payrollSalaryStructureService } from '../services/payroll/payroll-salary-structure.service';

// Get current salary structure
  fastify.get(
    '/structure/current',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Payroll'],
        summary: 'Get current salary structure',
        description: 'Get the current active salary structure for logged-in user',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  _id: { type: 'string' },
                  userId: { type: 'string' },
                  basic: { type: 'number' },
                  hra: { type: 'number' },
                  specialAllowance: { type: 'number' },
                  effectiveFrom: { type: 'string', format: 'date' },
                  effectiveTill: { type: 'string', format: 'date', nullable: true }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const structure = await payrollSalaryStructureService.getCurrentStructure(
          new Types.ObjectId((request.user as any)._id)
        );
        return reply.send({
          success: true,
          data: structure,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  );

  // Get salary structure history
  fastify.get(
    '/structure/history',
    {
      onRequest: [authenticate],
      schema: {
        tags: ['Payroll'],
        summary: 'Get salary structure history',
        description: 'Get historical salary structures for logged-in user',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    _id: { type: 'string' },
                    userId: { type: 'string' },
                    basic: { type: 'number' },
                    hra: { type: 'number' },
                    specialAllowance: { type: 'number' },
                    effectiveFrom: { type: 'string', format: 'date' },
                    effectiveTill: { type: 'string', format: 'date', nullable: true }
                  }
                }
              }
            }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        const history = await payrollSalaryStructureService.getHistory(
          new Types.ObjectId((request.user as any)._id)
        );
        return reply.send({
          success: true,
          data: history,
        });
      } catch (error: any) {
        return reply.status(400).send({
          success: false,
          error: { message: error.message },
        });
      }
    }
  ); */