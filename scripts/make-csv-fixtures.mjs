// Generates CSV templates (src/content/templates) and test fixtures (tests/fixtures/csv)
// with exact bytes: UTF-8 BOM and CRLF where intended. Run: node scripts/make-csv-fixtures.mjs
import { mkdirSync, writeFileSync } from "node:fs";

const H =
  "external_id,type,question_text,option_a,option_b,option_c,option_d,correct_option,marks,explanation,topic,difficulty,question_image_ref,option_a_image_ref,option_b_image_ref,option_c_image_ref,option_d_image_ref";
const BOM = "\uFEFF";
const crlf = (lines) => lines.join("\r\n") + "\r\n";
const lf = (lines) => lines.join("\n") + "\n";

const example = [
  H,
  "MATH-Q001,SINGLE_CHOICE,What is 12 x 5?,50,60,65,70,B,1,12 x 5 = 60.,Multiplication,easy,,,,,",
  'MATH-Q002,,"x සඳහා විසඳන්න: සමීකරණය $x^2 - 5x + 6 = 0$ හි කුඩාම මූලය කුමක්ද?",$1$,$2$,$3$,$6$,b,2,"$(x-2)(x-3)=0$ නිසා x = 2 හෝ 3. කුඩාම මූලය 2.",වර්ගජ සමීකරණ,medium,,,,,',
  'GEN-Q003,SINGLE_CHOICE,"Which list is correct, given a, b and c?\nChoose one.","1, 2, 3","3, 2, 1","2, 1, 3","1, 3, 2",A,1,"The ""natural"" order.",Ordering,,,,,,',
];

const invalid = [
  H,
  ",SINGLE_CHOICE,Missing id,a,b,c,d,A,1,,,,,,,,",
  "BAD-KEY,SINGLE_CHOICE,Bad key,a,b,c,d,E,1,,,,,,,,",
  "ZERO-MARKS,SINGLE_CHOICE,Zero marks,a,b,c,d,A,0,,,,,,,,",
  "FRACTION-MARKS,SINGLE_CHOICE,Fraction marks,a,b,c,d,A,1.5,,,,,,,,",
  "EMPTY-OPTION,SINGLE_CHOICE,Empty option,a,b,,d,A,1,,,,,,,,",
  "BAD-TYPE,MULTI_CHOICE,Bad type,a,b,c,d,A,1,,,,,,,,",
  "URL-IMAGE,SINGLE_CHOICE,Url image,a,b,c,d,A,1,,,,https://example.com/x.png,,,,",
  "DUP-1,SINGLE_CHOICE,Dup one,a,b,c,d,A,1,,,,,,,,",
  "DUP-1,SINGLE_CHOICE,Dup two,a,b,c,d,A,1,,,,,,,,",
  "SAME-OPTIONS,SINGLE_CHOICE,Same options,x,x,c,d,C,1,,,,,,,,",
];

// One fixable error (for the E2E "fix an error" step): row 3 has correct_option "E".
const e2e = [
  H,
  "E2E-001,,What is 7 + 6?,11,12,13,14,C,1,7 + 6 = 13.,Addition,,,,,,",
  "E2E-002,,ශ්‍රී ලංකාවේ අගනුවර කුමක්ද?,කොළඹ,ශ්‍රී ජයවර්ධනපුර කෝට්ටේ,මහනුවර,ගාල්ල,E,1,,,,,,,,",
  "E2E-003,,Square root of $81$?,$7$,$8$,$9$,$10$,C,2,,,,,,,,",
];

const studentTemplate = ["ep_id,full_name,display_name,grade,whatsapp,school,district", "EP10001,Nimal Perera,Nimal P.,9,0771234567,Royal College,Colombo"];

mkdirSync("src/content/templates", { recursive: true });
mkdirSync("tests/fixtures/csv", { recursive: true });
writeFileSync("src/content/templates/questions-template.csv", BOM + crlf([H]));
writeFileSync("src/content/templates/questions-example.csv", BOM + crlf(example));
writeFileSync("src/content/templates/students-template.csv", BOM + crlf(studentTemplate));
writeFileSync("tests/fixtures/csv/valid-example.csv", BOM + crlf(example));
writeFileSync("tests/fixtures/csv/invalid-rows.csv", lf(invalid));
writeFileSync("tests/fixtures/csv/e2e-one-error.csv", BOM + crlf(e2e));
console.log("CSV templates and fixtures written.");
