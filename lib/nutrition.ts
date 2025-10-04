export type Activity = 'sedentary'|'light'|'moderate'|'active'|'very_active';
export type GoalType = 'lose'|'maintain'|'gain';

export function mifflinStJeorBMR(
  gender: 'male'|'female',
  weightKg: number,
  heightCm: number,
  ageYears: number
) {
  const base = 10*weightKg + 6.25*heightCm - 5*ageYears;
  return gender === 'male' ? base + 5 : base - 161;
}

export function activityFactor(level: Activity) {
  switch(level){
    case 'sedentary': return 1.2;
    case 'light': return 1.375;
    case 'moderate': return 1.55;
    case 'active': return 1.725;
    case 'very_active': return 1.9;
  }
}

export function tdee(bmr: number, level: Activity) {
  return bmr * activityFactor(level);
}

export function macroTargets(kcalTarget: number, weightKg: number, proteinPerKg = 1.8) {
  const protein = proteinPerKg * weightKg;            // g
  const proteinKcal = protein * 4;
  const remaining = Math.max(0, kcalTarget - proteinKcal);
  const carbs = (remaining * 0.5) / 4; // g
  const fat   = (remaining * 0.5) / 9; // g
  return { protein, carbs, fat };
}

export function yearsBetween(dob: Date) {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}
