// utils/licenseKey.js
import crypto from "crypto";
//import jwt from "jsonwebtoken";

export function generateLicenseKey(prefix = "BBX") {
  const random = crypto.randomBytes(16).toString("hex").toUpperCase();
  return `${prefix}-${random.match(/.{1,4}/g).join("-")}`;
}

// export function LicenseToken(company){
//   return jwt.sign(
//     {
//       licenseKey: company.licenseKey,
//       companyID: company.id,
//       exp: Math.floor(new Date(license.expiresAt).getTime() / 1000),
//     },
//     process.env.LICENSE_SECRET
//   );
// }