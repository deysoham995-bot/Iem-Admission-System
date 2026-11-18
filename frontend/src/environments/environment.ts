export const environment = {
  production: false,
  apiUrl:
    typeof window !== 'undefined' &&
    window.location.hostname === 'localhost' &&
    window.location.port === '4200'
      ? 'http://localhost:5001/api'
      : '/api',
  institutionName: 'Institute of Engineering & Management (IEM), Kolkata',
  academicCycle: '2026-2027',
  applicationFee: 2000,
};
