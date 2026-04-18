import { FC } from 'react';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import styles from './top-navigation-bar.module.css';

export const TopNavigationBar: FC = () => {
  return (
    <NavigationMenu.Root
      className={styles.topNavBar}
      orientation="horizontal"
    ></NavigationMenu.Root>
  );
};
