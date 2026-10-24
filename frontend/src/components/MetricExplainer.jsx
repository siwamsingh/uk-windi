import { ArrowLeftRight, Gauge, Scale, TrendingUp } from 'lucide-react'

const explanations = [
  {
    icon: Gauge,
    title: 'MAE · Average mistake',
    color: 'blue',
    short: 'How far off was the forecast, on average?',
    body: 'Imagine guessing the temperature each day. MAE takes every miss, ignores whether it was too high or too low, then averages how big the misses were. Smaller is better.',
  },
  {
    icon: Scale,
    title: 'RMSE · Big-miss detector',
    color: 'violet',
    short: 'Large mistakes count extra.',
    body: 'RMSE works a bit like MAE, but gives bigger mistakes more weight. It is useful because a very wrong forecast can be more troublesome than several small misses. Smaller is better.',
  },
  {
    icon: TrendingUp,
    title: 'Bias · Which way we miss',
    color: 'amber',
    short: 'Did we usually predict too much or too little?',
    body: 'Positive bias means the forecast said more wind would be produced than actually was. Negative bias means it predicted too little. Near zero means there is less one-way leaning, but mistakes can still be large.',
  },
  {
    icon: ArrowLeftRight,
    title: 'Error · One forecast’s miss',
    color: 'green',
    short: 'Prediction minus actual generation.',
    body: 'If the prediction is 12,000 MW and actual production is 10,000 MW, the error is +2,000 MW: 2,000 MW too high. The absolute error is 2,000 MW, without the plus or minus sign.',
  },
]

const colors = {
  blue: 'bg-blue-50 text-blue-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-emerald-50 text-emerald-700',
}

export default function MetricExplainer() {
  return (
    <section className="mt-8">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="section-eyebrow">Understand the numbers</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">Forecast errors, in plain English</h2>
        </div>
        <p className="max-w-xl text-sm leading-6 text-slate-500">These scores describe how well the prediction matched what happened. They do not directly tell a utility how much electricity it should buy.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {explanations.map(({ icon: Icon, title, short, body, color }) => (
          <article key={title} className="panel p-5">
            <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}><Icon size={18} /></span>
            <h3 className="mt-4 text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-2 text-sm font-medium leading-5 text-slate-700">{short}</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">{body}</p>
          </article>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <h3 className="text-sm font-bold text-slate-900">What does MW mean?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">MW means megawatts. It describes how much power is being generated at a point in time. It is like the speed of a tap, not the total amount of water collected in a bucket.</p>
        </article>
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <h3 className="text-sm font-bold text-slate-900">Why is the 30-minute chart different?</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">Actual wind generation comes every 30 minutes, while the forecast shown here is hourly. For the chart only, the hourly forecast is drawn across both half-hours. Accuracy scores use hourly averages so we compare like with like.</p>
        </article>
      </div>
    </section>
  )
}
