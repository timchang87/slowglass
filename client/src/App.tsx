import axios from 'axios';
import { FC, useEffect } from 'react';
import { TopNavigationBar } from './components/TopNavigationBar/TopNavigationBar';
import { SideNavigationBar } from './components/SideNavigationBar/SideNavigationBar';

const App: FC = () => {
  useEffect(() => {
    axios.get('/test').then(function (response) {
      console.log(response);
    });
  }, []);

  return (
    <>
      <TopNavigationBar />
      <SideNavigationBar />
    </>
  );
};

export default App;
