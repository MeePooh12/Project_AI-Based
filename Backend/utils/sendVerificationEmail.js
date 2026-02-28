import nodemailer from "nodemailer";

export default async function sendVerificationEmail(to, link) {

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS
    }
  });

  const html = `
    <h2>ยืนยันอีเมลของคุณ</h2>
    <p>ขอบคุณที่สมัครสมาชิก กรุณาคลิกลิงก์นี้เพื่อยืนยันบัญชี:</p>
    <a href="${link}" style="padding:10px 15px;background:#4f46e5;color:white;border-radius:8px;text-decoration:none;">
      ยืนยันอีเมล
    </a>
    <p>หากคุณไม่ได้สมัคร โปรดเพิกเฉยอีเมลนี้</p>
  `;

  return transporter.sendMail({
    from: `"AI Investment System" <${process.env.MAIL_USER}>`,
    to,
    subject: "กรุณายืนยันอีเมลของคุณ",
    html
  });
}
