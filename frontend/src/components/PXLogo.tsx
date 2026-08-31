import { FC } from 'react';

interface PXLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const PXLogo: FC<PXLogoProps> = ({
  size = 'md',
  showText = false,
  className = '',
}) => {
  const dimensions = {
    sm: { box: 'w-8 h-8', icon: 'w-5 h-5', text: 'text-sm', sub: 'text-[9px]' },
    md: { box: 'w-10 h-10', icon: 'w-6 h-6', text: 'text-base', sub: 'text-[11px]' },
    lg: { box: 'w-14 h-14', icon: 'w-8 h-8', text: 'text-xl', sub: 'text-xs' },
    xl: { box: 'w-20 h-20', icon: 'w-12 h-12', text: 'text-2xl', sub: 'text-sm' },
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Icono Monograma PX con efecto Neón / Gradiente */}
      <div
        className={`relative ${dimensions.box} rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-cyan-500 p-[1.5px] shadow-lg shadow-indigo-500/25 flex items-center justify-center shrink-0 group`}
      >
        {/* Fondo interior con blur */}
        <div className="w-full h-full bg-slate-950/90 rounded-[14px] flex items-center justify-center relative overflow-hidden backdrop-blur-md">
          {/* Resplandor de fondo */}
          <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/30 via-purple-500/20 to-cyan-400/30 opacity-70 group-hover:opacity-100 transition-opacity duration-300" />
          
          {/* SVG Vectorial Monograma PX Futurista */}
          <svg
            viewBox="0 0 48 48"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`${dimensions.icon} relative z-10 drop-shadow-[0_0_8px_rgba(99,102,241,0.8)]`}
          >
            <defs>
              <linearGradient id="pxGrad" x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
                <stop stopColor="#67E8F9" />
                <stop offset="0.5" stopColor="#818CF8" />
                <stop offset="1" stopColor="#C084FC" />
              </linearGradient>
              <linearGradient id="coreGlow" x1="20" y1="20" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                <stop stopColor="#38BDF8" />
                <stop offset="1" stopColor="#A855F7" />
              </linearGradient>
            </defs>
            
            {/* Letra P geométrica moderna */}
            <path
              d="M12 36V12H23C27.4183 12 31 15.5817 31 20C31 24.4183 27.4183 28 23 28H18"
              stroke="url(#pxGrad)"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            
            {/* Letra X entrelazada con el núcleo */}
            <path
              d="M22 18L36 36"
              stroke="url(#pxGrad)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            <path
              d="M36 12L28 22"
              stroke="url(#pxGrad)"
              strokeWidth="4"
              strokeLinecap="round"
            />

            {/* Núcleo de energía central radiante */}
            <circle cx="25" cy="23" r="2.5" fill="url(#coreGlow)" className="animate-pulse" />
          </svg>
        </div>
      </div>

      {/* Texto de Marca si está activo */}
      {showText && (
        <div className="flex flex-col">
          <div className={`font-black ${dimensions.text} tracking-tight text-white flex items-center gap-1.5`}>
            <span>PX</span>
            <span className="bg-gradient-to-r from-cyan-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
              CENTRAL
            </span>
            <span className="text-[10px] bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-cyan-300 px-1.5 py-0.5 rounded-full border border-cyan-500/30 font-semibold uppercase tracking-wider">
              PRO
            </span>
          </div>
          <span className={`${dimensions.sub} font-medium text-slate-400 tracking-wide uppercase`}>
            Media Management & Stremio
          </span>
        </div>
      )}
    </div>
  );
};
export default PXLogo;
