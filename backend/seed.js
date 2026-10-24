require('dotenv').config();
const mongoose = require('mongoose');
const Job = require('./models/Job');

const samples = [
  {
    company: 'Northwind Labs', title: 'Senior Frontend Engineer', location: 'Berlin, Germany', workMode: 'Hybrid',
    employmentType: 'Full-time', experienceLevel: 'Senior', postingUrl: 'https://example.com/jobs/frontend',
    description: 'Own the design system and lead the migration to Angular standalone components.',
    salary: { min: 75000, max: 95000, currency: 'EUR' }, skills: ['Angular', 'TypeScript', 'RxJS', 'CSS'],
    recruiter: { name: 'Mara Keller', email: 'mara@example.com', phone: '+49 30 1234567' }, isFavorite: true
  },
  {
    company: 'Brightpath', title: 'Full-stack Developer (MEAN)', location: 'Remote', workMode: 'Remote',
    employmentType: 'Contract', experienceLevel: 'Mid', postingUrl: 'https://example.com/jobs/mean',
    description: '6-month contract building internal tooling with MongoDB, Express, Angular and Node.',
    salary: { min: 50, max: 70, currency: 'USD' }, skills: ['MongoDB', 'Express', 'Angular', 'Node.js'],
    recruiter: { name: 'Dev Patel', email: 'dev@example.com' }
  },
  {
    company: 'Orchard Health', title: 'Software Engineering Intern', location: 'Austin, TX', workMode: 'On-site',
    employmentType: 'Internship', experienceLevel: 'Entry', salary: { min: 28, max: 32, currency: 'USD' },
    skills: ['JavaScript', 'Git', 'SQL'], isArchived: true
  }
];

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/job-tracker');
  await Job.deleteMany({});
  await Job.insertMany(samples);
  console.log(`Seeded ${samples.length} jobs`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
