import { motion } from 'framer-motion';
import { type ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

type Props = { children: ReactNode };

const slideVariants = {
  initial: {
    x: '100%',
    opacity: 0,
  },
  animate: {
    x: 0,
    opacity: 1,
    transition: {
      duration: 0.5,
      ease: 'easeIn',
    },
  },
  exit: {
    x: '-100%',
    opacity: 0,
    transition: {
      duration: 0.5,
      ease: 'easeOut',
    },
  },
} as const;

const AnimatedView = ({ children }: Props) => {
  const location = useLocation();
  const [shouldAnimate, setShouldAnimate] = useState(true);

  useEffect(() => {
    setShouldAnimate(true);
    // Reset animation after completion
    const timer = setTimeout(() => {
      setShouldAnimate(false);
    }, 1500); // Matches animate duration
    return () => clearTimeout(timer);
  }, [location.pathname]);

  return (
    <motion.div
      className='absolute inset-0 p-4'
      variants={slideVariants}
      initial={shouldAnimate ? 'initial' : false}
      animate='animate'
      exit='exit'
    >
      {children}
    </motion.div>
  );
};

export default AnimatedView;
