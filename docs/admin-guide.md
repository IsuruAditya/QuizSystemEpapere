# Admin guide

Times you enter and see are **Asia/Colombo**. Students see Sinhala by default and can switch to English.

## Publish a paper

1. **Exams → New exam.** Enter the title, grade, subject, teacher and mode.
   - **Ranked:** one official attempt, its own leaderboard, and a required close time.
   - **Practice:** repeatable, never ranked, may be untimed.
   - The defaults are 60 minutes. Ranked exams show the score immediately and answers after the close time.
2. The grade is the access rule: every enabled student currently in that grade can take the exam.
3. **Import questions from CSV** (or add questions from the bank, or write new ones).
4. **Preview**, which shows the answer key and is visible only to admins. Check marks, the key and the Sinhala/math rendering.
5. **Publish exam.** The questions and keys are frozen into a version. Copy the **share link** and send it to students.

To use a different paper later, **Duplicate** the exam. The copy has its own leaderboard. Never reuse one exam for different papers.

## CSV format and fixing errors

Download the **Template** or the **Example (Sinhala + English)** from the import page. Columns:

`external_id,type,question_text,option_a,option_b,option_c,option_d,correct_option,marks,explanation,topic,difficulty,question_image_ref,option_a_image_ref,option_b_image_ref,option_c_image_ref,option_d_image_ref`

| Column | Required | Rules / default |
|---|---|---|
| external_id | yes | letters, digits, `-` `_` `.`; unique in the file |
| type | no | blank = `SINGLE_CHOICE` (the only supported type) |
| question_text, option_a–d | yes* | text, or an image ref, or both. Math between `$…$` |
| correct_option | yes | `A`, `B`, `C` or `D` (case and spaces ignored). Numbers are rejected |
| marks | yes | whole number 1–100 |
| explanation, topic, difficulty | no | blank = none |
| *_image_ref | no | a **media ID** from the Media page (URLs are rejected). Image-only content needs alt text on the media item |

Save from Excel as **"CSV UTF-8"** so that Sinhala text survives. Upload, and every problem row is listed with its column. Edit the cells in place, or remove a row, then press **Revalidate changes**. Questions are added only when **all** rows are valid. Identical options produce a warning, not an error. Importing the same file into the same exam twice asks for confirmation. Imports never change a published exam.

## Question bank

Editing a question saves a **new version**. Draft exams switch to the new version; published exams keep the version they were published with.

## Students

- **Add a student**, or **Bulk registration (CSV)** using the separate students template. Validate first; nothing is created until every row is valid. Then download the one-time credentials file.
- WhatsApp numbers are private, may be a guardian's, and need not be unique.
- **Reset password** asks for your password, shows a one-time temporary password, and signs the student out everywhere. The student must choose a new password at their next sign-in. Confirm the student's identity before giving it out.
- **Disable** signs the student out immediately and blocks new attempts. An exam already in progress ends at its deadline with the answers already saved.
- **Remove personal data** is permanent: profile details are erased and results are kept anonymously.

## Results, rankings, voids and key corrections

- **Results** shows counts, mean/max/min, the top 10, every attempt (status, last save time, revision, how it finished) and **Export CSV**. The export contains personal data, so handle it carefully.
- The leaderboard is **per exam**: higher marks first, then shorter time; identical marks and time share a rank (1, 2, 2, 4). It is **provisional** until the exam closes, every attempt is finalised and any regrade has finished.
- **Void** (after submission) needs a reason and your password. Tick "Allow one replacement attempt" if the student should retake. The original record stays in history.
- **Correct an answer key** needs a reason and your password. It creates a new grading revision; all results are recalculated in the background. Start, submit and time-taken values never change. The leaderboard shows a notice and stays provisional until the regrade finishes (see Overview for job status).

## Troubleshooting

| Symptom | Action |
|---|---|
| Overview: "expired attempts not yet finalised" | The scheduled job runner is not running (see deployment.md §3) |
| Overview: failed job | Read the error; correct the data (e.g. a key) and run the correction again |
| Student says "Saving failed" | Their connection dropped; answers are kept on the device and retried. Nothing to do unless it persists |
| Student opened the exam on two devices | The second device asks them to "Continue here"; only one device saves at a time |
