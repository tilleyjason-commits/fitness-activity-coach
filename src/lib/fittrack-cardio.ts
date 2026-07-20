import type { CardioEquipment } from './types';

// Cardio equipment commonly listed or found at Anytime Fitness clubs.
// Published AF equipment lists include treadmills, elliptical cross-trainers,
// exercise bikes, stair climbers, rowing machines, and spin bikes. Exact
// models vary by club, so this section groups common variants users may see.
export const CARDIO_EQUIPMENT: CardioEquipment[] = [
  {
    id: 'treadmill',
    name: 'Treadmill',
    category: 'Running / Walking',
    description: 'Motorized walking, jogging, and running with speed and incline controls.',
  },
  {
    id: 'incline-treadmill',
    name: 'Incline Treadmill',
    category: 'Running / Walking',
    description: 'Treadmill-focused incline walking for higher-output, low-impact cardio.',
  },
  {
    id: 'elliptical-cross-trainer',
    name: 'Elliptical Cross-Trainer',
    category: 'Low Impact',
    description: 'Total-body low-impact cardio using pedals and moving handles.',
  },
  {
    id: 'lower-body-elliptical',
    name: 'Lower-Body Elliptical',
    category: 'Low Impact',
    description: 'Elliptical-style cardio focused mainly on legs with fixed or minimal handles.',
  },
  {
    id: 'upright-bike',
    name: 'Upright Bike',
    category: 'Bike',
    description: 'Traditional seated exercise bike for steady-state or interval cardio.',
  },
  {
    id: 'recumbent-bike',
    name: 'Recumbent Bike',
    category: 'Bike',
    description: 'Bike with a reclined seat and back support for lower-impact cardio.',
  },
  {
    id: 'spin-bike',
    name: 'Spin Bike',
    category: 'Bike',
    description: 'Indoor cycling bike for higher-intensity riding and class-style workouts.',
  },
  {
    id: 'air-bike',
    name: 'Air Bike',
    category: 'Bike',
    description: 'Fan-resistance bike using arms and legs for hard conditioning intervals.',
  },
  {
    id: 'stair-climber',
    name: 'Stair Climber',
    category: 'Climbing',
    description: 'Continuous stair-stepping machine for legs, glutes, and conditioning.',
  },
  {
    id: 'stepper',
    name: 'Stepper',
    category: 'Climbing',
    description: 'Compact stepping machine for lower-body cardio without a full stair belt.',
  },
  {
    id: 'rowing-machine',
    name: 'Rowing Machine',
    category: 'Full Body',
    description: 'Full-body pull-and-drive cardio using legs, back, arms, and core.',
  },
  {
    id: 'arc-trainer',
    name: 'Arc Trainer',
    category: 'Low Impact',
    description: 'Low-impact cardio machine with an arcing stride pattern, similar to an elliptical variant.',
  },
];
