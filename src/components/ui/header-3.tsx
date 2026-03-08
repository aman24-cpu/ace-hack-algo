'use client';
import React from 'react';
import { cn } from "../../lib/utils";
import { createPortal } from 'react-dom';
import { 
    LucideIcon,
    CodeIcon,
	GlobeIcon,
	LayersIcon,
	UserPlusIcon,
	Users,
	Star,
	FileText,
	Shield,
	RotateCcw,
	Handshake,
	Leaf,
	HelpCircle,
	BarChart,
	PlugIcon,
    GraduationCap,
    LayoutDashboard,
    ShoppingBag,
    Briefcase,
    Settings,
    Menu,
    X,
    ChevronDown
} from 'lucide-react';

type LinkItem = {
	title: string;
	href?: string;
	icon: LucideIcon;
	description?: string;
    onClick?: () => void;
};

interface HeaderProps {
    activeTab: 'dashboard' | 'marketplace' | 'gigs' | 'split' | 'settings';
    setActiveTab: (tab: any) => void;
    accountAddress: string | null;
}

export function Header({ activeTab, setActiveTab, accountAddress }: HeaderProps) {
	const [open, setOpen] = React.useState(false);
    const [explorerOpen, setExplorerOpen] = React.useState(false);
	const scrolled = useScroll(10);

	React.useEffect(() => {
		if (open) {
			document.body.style.overflow = 'hidden';
		} else {
			document.body.style.overflow = '';
		}
		return () => {
			document.body.style.overflow = '';
		};
	}, [open]);

    const mainLinks: LinkItem[] = [
        {
            title: 'Dashboard',
            icon: LayoutDashboard,
            description: 'Your campus financial overview',
            onClick: () => { setActiveTab('dashboard'); setOpen(false); setExplorerOpen(false); }
        },
        {
            title: 'Marketplace',
            icon: ShoppingBag,
            description: 'Buy and sell campus goods',
            onClick: () => { setActiveTab('marketplace'); setOpen(false); setExplorerOpen(false); }
        },
        {
            title: 'Campus Gigs',
            icon: Briefcase,
            description: 'Find tasks and earn ALGO',
            onClick: () => { setActiveTab('gigs'); setOpen(false); setExplorerOpen(false); }
        },
        {
            title: 'Split Expenses',
            icon: LayersIcon,
            description: 'Fair sharing with roommates',
            onClick: () => { setActiveTab('split'); setOpen(false); setExplorerOpen(false); }
        }
    ];

	return (
		<header
			className={cn('sticky top-0 z-50 w-full border-b border-transparent transition-all duration-300', {
				'bg-white/80 border-zinc-200 backdrop-blur-xl py-2': scrolled,
                'bg-transparent py-4': !scrolled
			})}
		>
			<nav className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-6">
				<div className="flex items-center gap-8">
					<div 
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => setActiveTab('dashboard')}
                    >
						<div className="bg-red-600 p-1.5 rounded-lg group-hover:rotate-12 transition-transform shadow-[0_0_15px_rgba(220,38,38,0.3)]">
                            <GraduationCap className="w-5 h-5 text-white" />
                        </div>
                        <span className="font-black text-xl tracking-tighter text-zinc-900">CAMPUS PAY</span>
					</div>
					<div className="hidden md:flex items-center gap-2">
                        <div className="relative">
                            <button 
                                onClick={() => setExplorerOpen(!explorerOpen)}
                                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                            >
                                Explorer
                                <ChevronDown className={cn("w-4 h-4 transition-transform", explorerOpen && "rotate-180")} />
                            </button>
                            
                            {explorerOpen && (
                                <div className="absolute top-full left-0 mt-2 w-[400px] bg-white border border-zinc-200 rounded-2xl shadow-2xl p-4 grid grid-cols-2 gap-2 animate-in fade-in slide-in-from-top-2">
                                    {mainLinks.map((item, i) => (
                                        <ListItem key={i} {...item} />
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <button 
                            onClick={() => setActiveTab('marketplace')}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors rounded-md hover:bg-zinc-100",
                                activeTab === 'marketplace' ? "text-zinc-900 bg-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                            )}
                        >
                            Shop
                        </button>
                        <button 
                            onClick={() => setActiveTab('gigs')}
                            className={cn(
                                "px-4 py-2 text-sm font-medium transition-colors rounded-md hover:bg-zinc-100",
                                activeTab === 'gigs' ? "text-zinc-900 bg-zinc-100" : "text-zinc-600 hover:text-zinc-900"
                            )}
                        >
                            Gigs
                        </button>
					</div>
				</div>

				<div className="hidden items-center gap-4 md:flex">
					{accountAddress ? (
                        <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 shadow-inner">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-mono text-zinc-400">
                                {accountAddress.slice(0, 4)}...{accountAddress.slice(-4)}
                            </span>
                        </div>
                    ) : (
                        <button className="px-6 py-2 rounded-full border border-zinc-200 bg-transparent text-zinc-900 hover:bg-zinc-100 font-bold transition-all">
                            Connect Wallet
                        </button>
                    )}
					<button className="px-6 py-2 rounded-full bg-zinc-900 text-white hover:bg-zinc-800 font-bold transition-all shadow-lg shadow-zinc-900/10">
						Get Started
					</button>
				</div>

				<button
					onClick={() => setOpen(!open)}
					className="md:hidden p-2 text-zinc-900 hover:bg-zinc-100 rounded-xl transition-all"
					aria-expanded={open}
					aria-label="Toggle menu"
				>
					{open ? <X className="size-6" /> : <Menu className="size-6" />}
				</button>
			</nav>

			<MobileMenu open={open} className="flex flex-col justify-between gap-6 overflow-y-auto pb-8">
				<div className="flex w-full flex-col gap-y-4">
					<span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Navigation</span>
					{mainLinks.map((link) => (
						<button 
                            key={link.title} 
                            onClick={link.onClick}
                            className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 transition-colors text-left"
                        >
                            <div className="p-2 rounded-xl bg-white shadow-sm border border-zinc-200">
                                <link.icon className="w-5 h-5 text-zinc-900" />
                            </div>
                            <div className="flex flex-col text-zinc-900">
                                <span className="font-bold">{link.title}</span>
                                <span className="text-xs text-zinc-500">{link.description}</span>
                            </div>
                        </button>
					))}
				</div>
				<div className="flex flex-col gap-3">
					<button className="w-full bg-transparent border border-zinc-200 text-zinc-900 rounded-2xl py-6 font-bold hover:bg-zinc-50 transition-all">
						{accountAddress ? 'Account Connected' : 'Connect Wallet'}
					</button>
					<button className="w-full bg-zinc-900 text-white rounded-2xl py-6 font-bold shadow-xl shadow-zinc-900/20 hover:bg-zinc-800 transition-all">
                        Get Started
                    </button>
				</div>
			</MobileMenu>
		</header>
	);
}

type MobileMenuProps = React.ComponentProps<'div'> & {
	open: boolean;
};

function MobileMenu({ open, children, className, ...props }: MobileMenuProps) {
	if (!open || typeof window === 'undefined') return null;

	return createPortal(
		<div
			id="mobile-menu"
			className={cn(
				'bg-white/95 backdrop-blur-2xl transition-all duration-300',
				'fixed inset-0 top-14 z-[400] flex flex-col overflow-hidden md:hidden animate-in fade-in slide-in-from-top-4',
			)}
		>
			<div
				className={cn(
					'size-full p-6 flex flex-col',
					className,
				)}
				{...props}
			>
				{children}
			</div>
		</div>,
		document.body,
	);
}

function ListItem({
	title,
	description,
	icon: Icon,
	className,
    onClick,
	...props
}: any) {
	return (
		<div 
            className={cn(
                'w-full flex items-start gap-3 rounded-xl p-3 transition-all hover:bg-zinc-50 group cursor-pointer border border-transparent hover:border-zinc-100',
                className
            )} 
            onClick={onClick}
        >
            <div className="flex-shrink-0 bg-zinc-100 flex aspect-square size-10 items-center justify-center rounded-lg border border-zinc-200 shadow-sm group-hover:scale-110 transition-transform">
                <Icon className="text-zinc-500 group-hover:text-zinc-900 size-5" />
            </div>
            <div className="flex flex-col items-start justify-center">
                <span className="font-bold text-sm text-zinc-700 group-hover:text-zinc-900">{title}</span>
                <span className="text-zinc-400 text-[11px] leading-tight line-clamp-1">{description}</span>
            </div>
		</div>
	);
}

function useScroll(threshold: number) {
	const [scrolled, setScrolled] = React.useState(false);

	const onScroll = React.useCallback(() => {
		setScrolled(window.scrollY > threshold);
	}, [threshold]);

	React.useEffect(() => {
		window.addEventListener('scroll', onScroll);
		return () => window.removeEventListener('scroll', onScroll);
	}, [onScroll]);

	React.useEffect(() => {
		onScroll();
	}, [onScroll]);

	return scrolled;
}
