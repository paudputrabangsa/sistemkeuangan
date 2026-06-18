interface WizardStepperProps {
  steps: string[];
  activeIndex: number;
  onStepClick?: (index: number) => void;
  columnsClassName?: string;
}

export default function WizardStepper({ steps, activeIndex, onStepClick, columnsClassName = 'grid-cols-2 md:grid-cols-5' }: WizardStepperProps) {
  return (
    <div className={`grid gap-2 ${columnsClassName}`}>
      {steps.map((step, index) => (
        <button
          key={step}
          type="button"
          onClick={() => onStepClick?.(index)}
          className={`rounded-xl px-3 py-2 text-xs font-extrabold ${activeIndex === index ? 'bg-brand-600 text-white' : index < activeIndex ? 'bg-brand-50 text-brand-700 dark:bg-brand-950/30 dark:text-brand-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-400'}`}
        >
          {index + 1}. {step}
        </button>
      ))}
    </div>
  );
}
