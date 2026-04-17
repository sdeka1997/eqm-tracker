const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-4',
  lg: 'h-8 w-8 border-4',
  xl: 'h-10 w-10 border-4',
}

const colors = {
  blue: 'border-alaska-blue',
  teal: 'border-alaska-teal',
  white: 'border-white',
}

export default function Spinner({ size = 'lg', color = 'blue', className = '' }) {
  return (
    <div className={`animate-spin rounded-full border-t-transparent ${sizes[size]} ${colors[color]} ${className}`} />
  )
}
