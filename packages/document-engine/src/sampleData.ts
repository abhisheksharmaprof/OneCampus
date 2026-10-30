export interface DatasetFieldDef {
  key: string
  label: string
  dataType: 'string' | 'number' | 'currency' | 'date'
  example: string
}

export interface DatasetDefinition {
  name: string
  label: string
  category: string
  description: string
  fields: DatasetFieldDef[]
  sampleRows: Array<Record<string, unknown>>
  defaultColumns: Array<{
    header: string
    fieldId: string
    widthPercent: number
    align?: 'left' | 'center' | 'right'
  }>
}

export const CANONICAL_DATASETS: Record<string, DatasetDefinition> = {
  'academics.exam_marks': {
    name: 'academics.exam_marks',
    label: 'Exam Marks & Grades',
    category: 'MARKSHEET',
    description: 'Subject-wise marks, maximum marks, practicals, grades, and remarks.',
    fields: [
      { key: 'subject_code', label: 'Subject Code', dataType: 'string', example: 'ENG-101' },
      { key: 'subject', label: 'Subject Name', dataType: 'string', example: 'English Core' },
      { key: 'max_theory', label: 'Max Theory', dataType: 'number', example: '80' },
      { key: 'obtained_theory', label: 'Obtained Theory', dataType: 'number', example: '72' },
      { key: 'max_practical', label: 'Max Practical', dataType: 'number', example: '20' },
      { key: 'obtained_practical', label: 'Obtained Practical', dataType: 'number', example: '18' },
      { key: 'max_marks', label: 'Total Max Marks', dataType: 'number', example: '100' },
      { key: 'marks', label: 'Total Obtained Marks', dataType: 'number', example: '90' },
      { key: 'grade', label: 'Letter Grade', dataType: 'string', example: 'A1' },
      { key: 'grade_points', label: 'Grade Points', dataType: 'number', example: '9.0' },
      { key: 'remarks', label: 'Remarks', dataType: 'string', example: 'Outstanding' },
    ],
    defaultColumns: [
      { header: 'Subject', fieldId: 'subject', widthPercent: 40, align: 'left' },
      { header: 'Max Marks', fieldId: 'max_marks', widthPercent: 20, align: 'right' },
      { header: 'Marks Obtained', fieldId: 'marks', widthPercent: 25, align: 'right' },
      { header: 'Grade', fieldId: 'grade', widthPercent: 15, align: 'center' },
    ],
    sampleRows: [
      { subject_code: 'ENG-101', subject: 'English Core', max_theory: 80, obtained_theory: 72, max_practical: 20, obtained_practical: 18, max_marks: 100, marks: 90, grade: 'A1', grade_points: 9.0, remarks: 'Outstanding' },
      { subject_code: 'MATH-041', subject: 'Mathematics', max_theory: 80, obtained_theory: 76, max_practical: 20, obtained_practical: 20, max_marks: 100, marks: 96, grade: 'A1', grade_points: 10.0, remarks: 'Distinction' },
      { subject_code: 'PHY-042', subject: 'Physics', max_theory: 70, obtained_theory: 64, max_practical: 30, obtained_practical: 28, max_marks: 100, marks: 92, grade: 'A1', grade_points: 9.2, remarks: 'Distinction' },
      { subject_code: 'CHEM-043', subject: 'Chemistry', max_theory: 70, obtained_theory: 60, max_practical: 30, obtained_practical: 27, max_marks: 100, marks: 87, grade: 'A2', grade_points: 8.7, remarks: 'Very Good' },
      { subject_code: 'CS-083', subject: 'Computer Science', max_theory: 70, obtained_theory: 68, max_practical: 30, obtained_practical: 30, max_marks: 100, marks: 98, grade: 'A1', grade_points: 9.8, remarks: 'Exemplary' },
    ],
  },

  'finance.fee_items': {
    name: 'finance.fee_items',
    label: 'Fee Line Items',
    category: 'FEE_INVOICE',
    description: 'Itemized billing components, quantities, rates, and totals.',
    fields: [
      { key: 'description', label: 'Fee Description', dataType: 'string', example: 'Tuition Fee (Term 1)' },
      { key: 'period', label: 'Billing Period', dataType: 'string', example: 'Apr – Sep 2026' },
      { key: 'qty', label: 'Quantity', dataType: 'number', example: '1' },
      { key: 'rate', label: 'Unit Rate (₹)', dataType: 'currency', example: '15000' },
      { key: 'amount', label: 'Amount (₹)', dataType: 'currency', example: '15000' },
      { key: 'tax_rate', label: 'GST %', dataType: 'number', example: '18' },
      { key: 'tax_amount', label: 'Tax Amount (₹)', dataType: 'currency', example: '2700' },
      { key: 'total', label: 'Line Total (₹)', dataType: 'currency', example: '17700' },
    ],
    defaultColumns: [
      { header: 'Description', fieldId: 'description', widthPercent: 40, align: 'left' },
      { header: 'Period', fieldId: 'period', widthPercent: 20, align: 'left' },
      { header: 'Qty', fieldId: 'qty', widthPercent: 10, align: 'center' },
      { header: 'Rate (₹)', fieldId: 'rate', widthPercent: 15, align: 'right' },
      { header: 'Amount (₹)', fieldId: 'amount', widthPercent: 15, align: 'right' },
    ],
    sampleRows: [
      { id: 'f1', description: 'Tuition Fee - Term 1', period: 'Apr – Sep 2026', qty: 1, rate: 18500, amount: 18500, tax_rate: 0, tax_amount: 0, total: 18500 },
      { id: 'f2', description: 'Science Lab & Tech Fee', period: 'Annual', qty: 1, rate: 3500, amount: 3500, tax_rate: 0, tax_amount: 0, total: 3500 },
      { id: 'f3', description: 'Library & Subscriptions', period: 'Annual', qty: 1, rate: 1500, amount: 1500, tax_rate: 0, tax_amount: 0, total: 1500 },
      { id: 'f4', description: 'Sports & Facilities', period: 'Annual', qty: 1, rate: 2000, amount: 2000, tax_rate: 0, tax_amount: 0, total: 2000 },
      { id: 'f5', description: 'Development Fund', period: 'One-time', qty: 1, rate: 2500, amount: 2500, tax_rate: 0, tax_amount: 0, total: 2500 },
    ],
  },

  'student.exam_schedule': {
    name: 'student.exam_schedule',
    label: 'Assigned Exam Schedule',
    category: 'ADMIT_CARD',
    description: 'Dates, session timings, rooms, and seat assignments for exams.',
    fields: [
      { key: 'paper_code', label: 'Paper Code', dataType: 'string', example: 'ENG-101' },
      { key: 'subject', label: 'Subject', dataType: 'string', example: 'English Core' },
      { key: 'date', label: 'Exam Date', dataType: 'date', example: '12 Nov 2026' },
      { key: 'day', label: 'Day of Week', dataType: 'string', example: 'Thursday' },
      { key: 'time', label: 'Session Time', dataType: 'string', example: '09:00 AM – 12:00 PM' },
      { key: 'room', label: 'Hall / Room', dataType: 'string', example: 'Auditorium Hall A' },
      { key: 'seat_no', label: 'Assigned Seat', dataType: 'string', example: 'A-12' },
      { key: 'invigilator', label: 'Chief Invigilator', dataType: 'string', example: 'Dr. M. S. Rao' },
    ],
    defaultColumns: [
      { header: 'Subject', fieldId: 'subject', widthPercent: 35, align: 'left' },
      { header: 'Date', fieldId: 'date', widthPercent: 20, align: 'left' },
      { header: 'Time', fieldId: 'time', widthPercent: 25, align: 'center' },
      { header: 'Room / Seat', fieldId: 'room', widthPercent: 20, align: 'left' },
    ],
    sampleRows: [
      { paper_code: 'ENG-101', subject: 'English Core', date: '12 Nov 2026', day: 'Thursday', time: '09:00 – 12:00', room: 'Hall A (Seat 14)', seat_no: 'A-14', invigilator: 'Dr. Rao' },
      { paper_code: 'MATH-041', subject: 'Mathematics', date: '16 Nov 2026', day: 'Monday', time: '09:00 – 12:00', room: 'Hall A (Seat 14)', seat_no: 'A-14', invigilator: 'Prof. Joshi' },
      { paper_code: 'PHY-042', subject: 'Physics', date: '19 Nov 2026', day: 'Thursday', time: '09:00 – 12:00', room: 'Lab 2 (Seat 08)', seat_no: 'L2-08', invigilator: 'Dr. Sengupta' },
      { paper_code: 'CHEM-043', subject: 'Chemistry', date: '23 Nov 2026', day: 'Monday', time: '09:00 – 12:00', room: 'Lab 2 (Seat 08)', seat_no: 'L2-08', invigilator: 'Mrs. Dsouza' },
      { paper_code: 'CS-083', subject: 'Computer Science', date: '26 Nov 2026', day: 'Thursday', time: '09:00 – 12:00', room: 'Lab 4 (Seat 22)', seat_no: 'L4-22', invigilator: 'Mr. Khan' },
    ],
  },

  'student.attendance_summary': {
    name: 'student.attendance_summary',
    label: 'Monthly Attendance Summary',
    category: 'MARKSHEET',
    description: 'Working days, days present, days absent, and attendance percentage.',
    fields: [
      { key: 'month', label: 'Month', dataType: 'string', example: 'July 2026' },
      { key: 'working_days', label: 'Working Days', dataType: 'number', example: '24' },
      { key: 'present_days', label: 'Present Days', dataType: 'number', example: '23' },
      { key: 'absent_days', label: 'Absent Days', dataType: 'number', example: '1' },
      { key: 'percentage', label: 'Attendance %', dataType: 'number', example: '95.8' },
    ],
    defaultColumns: [
      { header: 'Month', fieldId: 'month', widthPercent: 30, align: 'left' },
      { header: 'Working Days', fieldId: 'working_days', widthPercent: 20, align: 'right' },
      { header: 'Present', fieldId: 'present_days', widthPercent: 20, align: 'right' },
      { header: 'Absent', fieldId: 'absent_days', widthPercent: 15, align: 'right' },
      { header: 'Percentage', fieldId: 'percentage', widthPercent: 15, align: 'right' },
    ],
    sampleRows: [
      { month: 'Jul 2026', working_days: 24, present_days: 23, absent_days: 1, percentage: 95.8 },
      { month: 'Aug 2026', working_days: 22, present_days: 22, absent_days: 0, percentage: 100.0 },
      { month: 'Sep 2026', working_days: 25, present_days: 24, absent_days: 1, percentage: 96.0 },
      { month: 'Oct 2026', working_days: 20, present_days: 19, absent_days: 1, percentage: 95.0 },
    ],
  },

  'finance.fee_installments': {
    name: 'finance.fee_installments',
    label: 'Fee Installment Schedule',
    category: 'FEE_INVOICE',
    description: 'Installment number, due date, amount, status, and payment date.',
    fields: [
      { key: 'installment_no', label: 'Installment No', dataType: 'string', example: 'Inst #1' },
      { key: 'due_date', label: 'Due Date', dataType: 'date', example: '15 Jul 2026' },
      { key: 'amount', label: 'Amount (₹)', dataType: 'currency', example: '12000' },
      { key: 'status', label: 'Payment Status', dataType: 'string', example: 'Paid' },
      { key: 'paid_at', label: 'Paid On', dataType: 'date', example: '10 Jul 2026' },
    ],
    defaultColumns: [
      { header: 'Installment', fieldId: 'installment_no', widthPercent: 25, align: 'left' },
      { header: 'Due Date', fieldId: 'due_date', widthPercent: 25, align: 'left' },
      { header: 'Amount (₹)', fieldId: 'amount', widthPercent: 25, align: 'right' },
      { header: 'Status', fieldId: 'status', widthPercent: 25, align: 'center' },
    ],
    sampleRows: [
      { installment_no: 'Inst #1 (Admission)', due_date: '15 Jul 2026', amount: 15000, status: 'Paid', paid_at: '10 Jul 2026' },
      { installment_no: 'Inst #2 (Mid-Term)', due_date: '15 Oct 2026', amount: 15000, status: 'Paid', paid_at: '12 Oct 2026' },
      { installment_no: 'Inst #3 (Final)', due_date: '15 Jan 2027', amount: 15000, status: 'Pending', paid_at: '—' },
    ],
  },
}

export const DATASET_ALIASES: Record<string, string> = {
  fee_items: 'finance.fee_items',
  marks: 'academics.exam_marks',
  exam_schedule: 'student.exam_schedule',
}

export function resolveDatasetName(name: string): string {
  if (!name) return 'academics.exam_marks'
  return DATASET_ALIASES[name] || name
}

export function getSampleDataset(name: string): Array<Record<string, unknown>> {
  const resolved = resolveDatasetName(name)
  return CANONICAL_DATASETS[resolved]?.sampleRows ?? []
}

export function getDatasetDefinition(name: string): DatasetDefinition | undefined {
  const resolved = resolveDatasetName(name)
  return CANONICAL_DATASETS[resolved]
}
