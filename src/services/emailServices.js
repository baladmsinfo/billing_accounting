const fs = require("fs");
const path = require("path");
const { emailQueue } = require("../queues/email.queue");

function loadTemplate(name, vars) {
    let tpl = fs.readFileSync(
        path.join(__dirname, "../templates", name),
        "utf-8"
    );
    Object.entries(vars).forEach(([k, v]) => {
        tpl = tpl.replace(new RegExp(`{{${k}}}`, "g"), v);
    });
    return tpl;
}

async function enqueuePaymentEmail(
    type,
    {
        to,
        studentName,
        institutionName,
        institutionEmail,
        department,
        totalDue,
        totalPaid,
        studentRollNo,
        paymentMethod,
        invoiceId,
        amount,
        academicYear,
        date,
    }
) {
    console.log("Email type:", type);
    const balanceDue = totalDue - totalPaid;

    const balanceLabel = balanceDue <= 0 ? "Nil" : `₹${balanceDue}`;
    const balanceColor = balanceDue <= 0 ? "#047857" : "#dc2626";

    const templateFile =
        type === "paid" || type === "partial"
            ? "payment-success.html"
            : "payment-failed.html";

    const formattedDate = new Date(date).toLocaleString("en-IN", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    });

    const html = loadTemplate(templateFile, {
        studentName,
        studentRollNo,
        invoiceId: String(invoiceId).padStart(8, "0"),
        totalDue,
        totalPaid,
        amount,
        balanceLabel,
        balanceColor,
        paymentMethod,
        paidAt: formattedDate,
        department,
        institutionName,
        academicYear,
        year: new Date().getFullYear(),
    });

    await emailQueue.add(
        "sendPaymentReceipt",
        {
            institutionName: institutionName,
            institutionEmail: institutionEmail,
            to,
            subject:
                type === "paid" || type === "partial"
                    ? "Payment Success Confirmation"
                    : "Payment Failure Notification",
            html,
        },
        {
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
        }
    );
}

async function enqueueUserRegistrationEmail({
    to,
    name,
    role,
    email,
    mobile_no,
    password,
}) {
    let templateFile =
        role === "ADMIN"
            ? "company_admin_registration.html"
            : "branch_admin_registration.html";

    const html = loadTemplate(templateFile, {
        to,
        name,
        role,
        email,
        mobile_no,
        password,
        base_url: process.env.WEB_URL || "http://localhost:3008"
    });

    await emailQueue
        .add("sendRegistrationEmail", {
            to,
            subject: role === "ADMIN" ? "Welcome to Bucksbox - Your Account Details" : "Branch Admin Account Created - Your Login Details",
            html,
        })
        .then((data) => {
            console.log("✅ Email job added:", data.name, data.id);
        })
        .catch((error) => {
            console.log("❌ Error adding email job:", error);
        });
}

async function sendForgotPasswordEmail({ to, institutionName, resetLink, year }) {
    const templateFile = "forgot_password_template.html";

    const html = loadTemplate(templateFile, {
        institutionName,
        resetLink,
        year,
    });

    await emailQueue.add(
        "sendForgotPasswordEmail",
        {
            to,
            cc: "dglnandha@gmail.com",
            subject: "Reset your password",
            html,
        },
        {
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
        }
    );
    console.log("📧 Forgot password email queued for", to);
}

async function sendDueBillEmail({ to, name, invoiceId, token, dueDate, totalAmount, feeRecords, institutionName, phone_no, fastify }) {
    const formattedDate = new Date(dueDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    const feeTableRows = feeRecords
        .map(
            (fr) => `
    <tr>
      <td>${fr.feeType || "-"}</td>
      <td>${fr.feeFrequency}</td>
      <td>${fr.amount}</td>
      <td>${fr.paid ? "Yes" : "No"}</td>
      <td>${fr.paidAmount || 0}</td>
    </tr>
  `
        )
        .join("");

    const paymentUrl = `${process.env.SWAGGER_URL}/bill?token=${encodeURIComponent(token)}`

    // const paymentUrl = `${process.env.FRONTEND_URL}/payment?token=${encodeURIComponent(token)}`;

    const html = `
    <p>Dear ${name},</p>
    <p>This is a reminder that you have a pending invoice <strong>#${invoiceId}</strong> due on <strong>${formattedDate}</strong>.</p>
    <p><strong>Total Amount:</strong> ₹${totalAmount}</p>

    <h3>Fee Breakdown</h3>
    <table border="1" cellspacing="0" cellpadding="6">
      <thead>
        <tr>
          <th>Fee Type</th>
          <th>Frequency</th>
          <th>Amount</th>
          <th>Paid</th>
          <th>Paid Amount</th>
        </tr>
      </thead>
      <tbody>
        ${feeTableRows}
      </tbody>
    </table>

    <p>Please complete your payment using the button.</p>
    <p>
    <a href="${paymentUrl}" style="color:#fff; background:#007bff; padding:10px 20px; 
       text-decoration:none; border-radius:4px; display:inline-block;">
      Pay Now
    </a>
    </p>
    <p>Thank you,<br/>Accounts Department</p>
  `;

    await emailQueue.add(
        "sendDueBillEmail",
        {
            from: "support@bucksbox.in",
            to,
            cc: "dglnandha@gmail.com",
            subject: `Invoice Due Reminder - Invoice #${invoiceId}`,
            html,
        },
        {
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
        }
    );
    console.log("📧 Due bill email queued for", to);

    // SMS payment link

    const data = {
        phone_no: phone_no,
        customer: name,
        institution: institutionName,
        paymentLink: paymentUrl,
    };

    const result = await fastify.gupshupsms.sendPaymentLink(data);

    console.log("SMS payment link result:", result);
}

async function sendPaymentLink({
    to,
    name,
    invoiceId,
    dueDate,
    totalAmount,
    feeRecords,
    token,
    phone_no,
    institutionName,
    fastify
}) {
    const formattedDate = new Date(dueDate).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });

    const feeTableRows = feeRecords
        .map(
            (fr) => `
      <tr>
        <td>${fr.feeType || "-"}</td>
        <td>${fr.feeFrequency || "-"}</td>
        <td>₹${fr.amount}</td>
        <td>${fr.paid ? "Yes" : "No"}</td>
        <td>₹${fr.paidAmount || 0}</td>
      </tr>
    `
        )
        .join("");

    const paymentUrl = `${process.env.SWAGGER_URL}/bill?token=${encodeURIComponent(token)}`;

    // const paymentUrl = `${process.env.FRONTEND_URL}/payment?token=${encodeURIComponent(token)}`;

    const html = `
  <p>Dear ${name},</p>
  <p>Your invoice <strong>#${invoiceId}</strong> is due on 
     <strong>${formattedDate}</strong>.</p>
  <p><strong>Total Amount:</strong> ₹${totalAmount}</p>

  <h3>Fee Breakdown</h3>
  <table border="1" cellspacing="0" cellpadding="6">
    <thead>
      <tr>
        <th>Fee Type</th>
        <th>Frequency</th>
        <th>Amount</th>
        <th>Paid</th>
        <th>Paid Amount</th>
      </tr>
    </thead>
    <tbody>
      ${feeTableRows}
    </tbody>
  </table>

  <p>Please complete your payment using the secure link below:</p>
  <p>
    <a href="${paymentUrl}" style="color:#fff; background:#007bff; padding:10px 20px; 
       text-decoration:none; border-radius:4px; display:inline-block;">
      Pay Now
    </a>
  </p>

  <p>Thank you,<br/>Accounts Department</p>
`;

    console.log("Payment URL:", paymentUrl);

    // 👇 queue the email job (BullMQ / Bull)
    await emailQueue.add(
        "sendPaymentLink",
        {
            from: "support@bucksbox.in",
            to,
            cc: "dglnandha@gmail.com",
            subject: `Invoice Payment Link - Invoice #${invoiceId}`,
            html,
        },
        {
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 }, // retry with exponential backoff
        }
    );

    console.log("📧 Payment link email queued for", to);

    // SMS payment link

    const data = {
        phone_no: phone_no,
        customer: name,
        institution: institutionName,
        paymentLink: paymentUrl,
    };

    const result = await fastify.gupshupsms.sendPaymentLink(data);

    console.log("SMS payment link result:", result);

}

async function sendStudentWelcomeEmail({ to, student, password }) {
    const {
        firstName,
        lastName,
        email,
        department,
        course,
        class: studentClass,
        institution,
    } = student;

    const fullName = `${firstName} ${lastName || ""}`.trim();

    const html = `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; background: #f9f9f9; border-radius: 10px;">
    <h2 style="color: #2c3e50;">Welcome to ${institution?.name || 'Our Institution'}, ${fullName}</h2>
    <!-- Institution Details -->
    <div style="background: #eef5ff; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="margin-top: 0; color: #1f4e79;">Institution Details</h3>
      <p><strong>Name:</strong> ${institution?.name}</p>
      <p><strong>Email:</strong> ${institution?.primary_email_id || 'N/A'}</p>
      <p><strong>Phone:</strong> ${institution?.primary_mobile_no || 'N/A'}</p>
      <p><strong>Address:</strong> 
        ${[institution?.address_line1, institution?.address_line2, institution?.address_line3]
            .filter(Boolean).join(', ') || 'N/A'}
      </p>
    </div>
    <!-- Course Details -->
    <div style="background: #fff8e1; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="margin-top: 0; color: #f57c00;">Course Details</h3>
      <p><strong>Department:</strong> ${department?.name || 'N/A'}</p>
      <p><strong>Course:</strong> ${course?.name || 'N/A'}</p>
      <p><strong>Class:</strong> ${studentClass?.name || 'N/A'}</p>
    </div>
    <!-- Login Credentials -->
    <div style="background: #e8f5e9; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
      <h3 style="margin-top: 0; color: #2e7d32;">Login Credentials</h3>
      <div style="margin-bottom: 10px;">
        <p style="margin: 4px 0;"><strong>Email:</strong></p>
        <div style="background: #ffffff; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
          ${email}
        </div>
      </div>
      <div>
        <p style="margin: 4px 0;"><strong>Password:</strong></p>
        <div style="background: #ffffff; padding: 10px; border: 1px solid #ccc; border-radius: 4px;">
          ${password}
        </div>
      </div>
    </div>
    <p>You can now log in to the student portal to manage your academic details and fee records.</p>
    <p style="margin-top: 40px;">Best regards,<br/><strong>${institution?.name || 'Institution Admin'}</strong></p>
  </div>
  `;

    await emailQueue.add(
        "sendStudentWelcomeEmail",
        {
            from: "support@bucksbox.in",
            to,
            cc: "dglnandha@gmail.com",
            subject: "🎓 Welcome to Our Institution – Your Login Credentials",
            html,
        },
        {
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
        }
    );
    console.log("📧 Welcome email queued for", to);
}

module.exports = {
    enqueuePaymentEmail,
    enqueueUserRegistrationEmail,
    sendForgotPasswordEmail,
    loadTemplate,
    sendDueBillEmail,
    sendPaymentLink,
    sendStudentWelcomeEmail
};