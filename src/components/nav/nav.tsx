import { motion, type Transition, type Variants } from 'framer-motion';
import React, { type FC, type RefObject, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import cn from 'classnames';
import { LuBrain } from 'react-icons/lu';
import styles from '@/components/nav/nav.module.scss';
import type { NavProps } from '@/components/nav/nav.props';

interface NavItem {
  icon: React.ReactNode;
  text: string;
  link: string;
}

const navigationItems: NavItem[] = [
  {
    icon: <LuBrain />,
    text: 'Keiko',
    link: '/',
  },
];

const Nav: FC<NavProps> = ({ isOpen, onToggle }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { height } = useDimensions(containerRef);

  const handleToggle = () => {
    onToggle(!isOpen);
  };

  return (
    <div>
      <motion.nav
        initial={false}
        animate={isOpen ? 'open' : 'closed'}
        custom={height}
        ref={containerRef}
      >
        <motion.div
          className={cn(styles.background, { [styles.backgroundOpen]: isOpen })}
          variants={sidebarVariants}
        />
        <Navigation items={navigationItems} />
        <MenuToggle toggle={handleToggle} isOpen={isOpen} />
      </motion.nav>
    </div>
  );
};

const navVariants: Variants = {
  open: {
    transition: { staggerChildren: 0.07, delayChildren: 0.2 },
  },
  closed: {
    transition: { staggerChildren: 0.05, staggerDirection: -1 },
  },
};

const Navigation = ({ items }: { items: NavItem[] }) => (
  <motion.ul className={styles.list} variants={navVariants}>
    {items.map((item, index) => (
      <MenuItem key={index} item={item} />
    ))}
  </motion.ul>
);

const itemVariants: Variants = {
  open: {
    y: 0,
    opacity: 1,
    transition: {
      y: { stiffness: 1000, velocity: -100 },
    },
  },
  closed: {
    y: 50,
    opacity: 0,
    transition: {
      y: { stiffness: 1000 },
    },
  },
};

const MenuItem = ({ item }: { item: NavItem }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(item.link);
  };

  return (
    <motion.li
      className={styles.listItem}
      variants={itemVariants}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleClick}
      style={{ cursor: 'pointer' }}
    >
      <div className={'text-text text-lg mr-2'}>{item.icon}</div>
      <div className={'text-text text-lg'}>{item.text}</div>
    </motion.li>
  );
};

// Corrected sidebarVariants with proper typing
const sidebarVariants: Variants = {
  open: (height = 1000): { clipPath: string; transition: Transition } => ({
    clipPath: `circle(${height * 2 + 200}px at 31px 31px)`,
    transition: {
      type: 'spring', // Explicitly set to "spring"
      stiffness: 20,
      restDelta: 2,
    },
  }),
  closed: {
    clipPath: 'circle(30px at 31px 31px)',
    transition: {
      delay: 0.2,
      type: 'spring', // Explicitly set to "spring"
      stiffness: 400,
      damping: 40,
    },
  },
};

interface PathProps {
  d?: string;
  variants: Variants;
  transition?: Transition;
  isOpen: boolean;
}

const Path = ({ isOpen, ...props }: PathProps) => (
  <motion.path className={cn(styles.path, { [styles.pathOpen]: isOpen })} {...props} />
);

const MenuToggle = ({ toggle, isOpen }: { toggle: () => void; isOpen: boolean }) => (
  <button className={styles.toggleContainer} onClick={toggle}>
    <svg width='24' height='24' viewBox='0 0 23 23'>
      <Path
        variants={{
          closed: { d: 'M 2 2.5 L 20 2.5' },
          open: { d: 'M 3 16.5 L 17 2.5' },
        }}
        isOpen={isOpen}
      />
      <Path
        d='M 2 9.423 L 20 9.423'
        variants={{
          closed: { opacity: 1 },
          open: { opacity: 0 },
        }}
        transition={{ duration: 0.1 }}
        isOpen={isOpen}
      />
      <Path
        variants={{
          closed: { d: 'M 2 16.346 L 20 16.346' },
          open: { d: 'M 3 2.5 L 17 16.346' },
        }}
        isOpen={isOpen}
      />
    </svg>
  </button>
);

const useDimensions = (ref: RefObject<HTMLDivElement | null>) => {
  const dimensions = useRef({ width: 0, height: 0 });

  useEffect(() => {
    if (ref.current) {
      dimensions.current.width = ref.current.offsetWidth;
      dimensions.current.height = ref.current.offsetHeight;
    }
  }, [ref]);

  return dimensions.current;
};

export default Nav;
